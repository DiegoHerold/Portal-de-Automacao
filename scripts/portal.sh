#!/usr/bin/env bash
# Sobe e derruba o Portal de Automacoes nativamente no Linux, com systemd
# (docs/visao-geral.md, "Como rodar"). E o par do scripts/portal.ps1 (Windows).
#
# Servicos (systemd), todos agrupados em portal-automacoes.target:
#   portal-automacoes-postgres   PostgreSQL dedicado (POSTGRES_PORT do backend/.env, padrao 5433, so loopback)
#   portal-automacoes-migrate    aplica as migrations (alembic upgrade head) a cada start
#   portal-automacoes-api        API (uvicorn, porta 8000; HTTPS com PORTAL_TLS_CERT/KEY)
#   portal-automacoes-worker     worker Celery
#   portal-automacoes-beat       beat Celery (sem ele nada dispara sozinho)
#   portal-automacoes-frontend   frontend Next.js standalone (porta 3000)
# O Redis e o servico da distribuicao (redis-server/redis) e nao e criado aqui.
#
# Uso:
#   sudo ./scripts/portal.sh setup           # dependencias, backend/.env, banco, build e servicos
#   sudo ./scripts/portal.sh start
#   ./scripts/portal.sh status               # 0 quando tudo esta no ar
#   ./scripts/portal.sh logs [api|worker|beat|frontend|postgres|migrate]
#   sudo ./scripts/portal.sh restart         # aplica migrations novas e o build novo
#   sudo ./scripts/portal.sh stop
#   sudo ./scripts/portal.sh open-firewall   # libera 3000/8000 para a subrede local (ufw ou firewalld)
#   sudo ./scripts/portal.sh remove-services # tira os servicos do systemd (dados ficam)
#   sudo ./scripts/portal.sh nginx <nome>    # publica em http://<nome> pelo nginx desta maquina
#
# Variaveis opcionais (valem no setup; os servicos guardam os valores):
#   PORTAL_USER      usuario que roda os servicos (padrao: dono da pasta do repositorio; nunca root)
#   PORTAL_DATA_DIR  banco, pacotes e arquivos de execucao (padrao: /var/lib/portal-automacoes)
#   PORTAL_PYTHON    Python 3.12+ (padrao: python3.12 ou python3)
#   PORTAL_NODE      Node.js 20+ (padrao: o node do PATH)
#   PG_BIN           pasta dos binarios do PostgreSQL (padrao: detectada)
#   PORTAL_PG_PORT   porta do PostgreSQL dedicado num setup novo (padrao: 5433). Depois vale o
#                    POSTGRES_PORT do backend/.env: troque la e rode "start" de novo.

set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
# Como foi chamado, com aspas quando o caminho tem espacos (para as mensagens).
SELF="$(printf %q "$0")"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_PATH")")"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
ENV_FILE="$BACKEND_DIR/.env"
VENV_PYTHON="$BACKEND_DIR/.venv/bin/python"
STANDALONE_DIR="$FRONTEND_DIR/.next/standalone"

DATA_DIR="${PORTAL_DATA_DIR:-/var/lib/portal-automacoes}"
PG_DATA="$DATA_DIR/postgres"
PACKAGES_DIR="$DATA_DIR/packages"
RUN_DIR="$DATA_DIR/run"

API_PORT=8000
FRONTEND_PORT=3000
DEFAULT_PG_PORT="${PORTAL_PG_PORT:-5433}"
TLS_CIPHERS='ECDHE+AESGCM:ECDHE+CHACHA20:!aNULL:!eNULL:!MD5:!DSS'

UNIT_DIR=/etc/systemd/system
PREFIX=portal-automacoes
TARGET="$PREFIX.target"
SERVICES=(postgres migrate api worker beat frontend)

# -- Utilitarios ------------------------------------------------------------

step() { printf '\033[36m>> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
die() { printf '\033[31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

require_root() {
    [ "$(id -u)" -eq 0 ] || die "rode com sudo: sudo $SELF $*"
}

# Le uma variavel do backend/.env sem executar o arquivo (valores podem ter espacos e \n).
env_value() {
    [ -r "$ENV_FILE" ] || return 0
    sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r' | sed 's/[[:space:]]*$//'
}

new_secret() { od -An -tx1 -N"${1:-32}" /dev/urandom | tr -d ' \n'; }

lan_address() {
    local address
    address="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
    [ -n "$address" ] || address="$(hostname -I 2>/dev/null | awk '{print $1}')"
    printf '%s' "${address:-localhost}"
}

tcp_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

http_ok() {
    local code
    code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$1" 2>/dev/null || true)"
    [ -n "$code" ] && [ "$code" != "000" ] && [ "$code" -lt 500 ]
}

wait_until() { # descricao, segundos, comando...
    local description="$1" seconds="$2"; shift 2
    local deadline=$((SECONDS + seconds))
    while [ "$SECONDS" -lt "$deadline" ]; do
        if "$@"; then return 0; fi
        sleep 0.5
    done
    die "timeout aguardando $description. Veja: $SELF logs"
}

managed_postgres() { [ "$(env_value PORTAL_MANAGED_POSTGRES)" = "true" ]; }

# Porta do PostgreSQL dedicado: a do backend/.env (a API conecta nela), senao a padrao.
pg_port() {
    local port
    port="$(env_value POSTGRES_PORT)"
    printf '%s' "${port:-$DEFAULT_PG_PORT}"
}

# Outro programa (ex.: um PostgreSQL da distribuicao) na porta do Portal: sem esta checagem
# a API conectaria nele e as migrations falhariam com "password authentication failed".
assert_pg_port_free() {
    managed_postgres || return 0
    systemctl is-active --quiet "$PREFIX-postgres.service" && return 0
    local port
    port="$(pg_port)"
    tcp_open "$port" || return 0
    die "a porta $port ja esta em uso por outro programa (veja: sudo ss -ltnp | grep :$port).
  Escolha uma porta livre para o banco do Portal, por exemplo $((port + 1)):
    sed -i 's/^POSTGRES_PORT=.*/POSTGRES_PORT=$((port + 1))/' $(printf %q "$ENV_FILE")
  e rode de novo: sudo $SELF setup   (regrava os servicos com a porta nova; dados e .env ficam)"
}

# -- Usuario e ferramentas ----------------------------------------------------

resolve_user() {
    PORTAL_USER="${PORTAL_USER:-$(stat -c %U "$REPO_ROOT")}"
    id "$PORTAL_USER" >/dev/null 2>&1 || die "usuario $PORTAL_USER nao existe."
    [ "$PORTAL_USER" != "root" ] || die "os servicos nao rodam como root. Passe a pasta para um usuario comum
  (sudo useradd --system --create-home portal && sudo chown -R portal: \"$REPO_ROOT\")
  ou indique um com PORTAL_USER=<usuario>."
    PORTAL_GROUP="$(id -gn "$PORTAL_USER")"
    PORTAL_HOME="$(getent passwd "$PORTAL_USER" | cut -d: -f6)"
    # Usuario de sistema sem pasta pessoal: pip e npm guardam o cache nos dados do Portal.
    if [ -z "$PORTAL_HOME" ] || [ ! -d "$PORTAL_HOME" ] || ! as_user test -w "$PORTAL_HOME"; then
        PORTAL_HOME="$DATA_DIR"
    fi
}

as_user() {
    runuser -u "$PORTAL_USER" -- env HOME="${PORTAL_HOME:-$DATA_DIR}" PATH="$PATH" "$@"
}

find_python() {
    local candidate
    for candidate in "${PORTAL_PYTHON:-}" python3.12 python3; do
        [ -n "$candidate" ] || continue
        candidate="$(command -v "$candidate" 2>/dev/null)" || continue
        if "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 12))' 2>/dev/null; then
            printf '%s' "$candidate"; return 0
        fi
    done
    die "Python 3.12+ nao encontrado. Debian/Ubuntu: sudo apt install python3.12 python3.12-venv"
}

find_node() {
    local node="${PORTAL_NODE:-$(command -v node 2>/dev/null || true)}"
    # No WSL o PATH traz o node do Windows (/mnt/c/...), que nao serve aqui.
    if [ -z "$node" ] || [[ "$node" == /mnt/* ]]; then
        die "Node.js 20+ nao encontrado. Instale pelo repositorio NodeSource (https://github.com/nodesource/distributions) ou indique com PORTAL_NODE."
    fi
    local major
    major="$("$node" -p 'process.versions.node.split(".")[0]')"
    [ "$major" -ge 20 ] || die "Node.js $("$node" -v) e antigo; o Portal precisa do 20 ou mais novo."
    printf '%s' "$(readlink -f "$node")"
}

find_pg_bin() {
    if [ -n "${PG_BIN:-}" ]; then printf '%s' "$PG_BIN"; return 0; fi
    local dir
    if command -v pg_config >/dev/null 2>&1; then
        dir="$(pg_config --bindir)"
        if [ -x "$dir/initdb" ]; then printf '%s' "$dir"; return 0; fi
    fi
    # Debian/Ubuntu (/usr/lib/postgresql/<versao>/bin) e repositorio PGDG no RHEL (/usr/pgsql-<versao>/bin).
    dir="$(ls -d /usr/lib/postgresql/*/bin /usr/pgsql-*/bin 2>/dev/null | sort -V | tail -n 1)"
    if [ -n "$dir" ] && [ -x "$dir/initdb" ]; then printf '%s' "$dir"; return 0; fi
    if command -v initdb >/dev/null 2>&1; then dirname "$(readlink -f "$(command -v initdb)")"; return 0; fi
    die "PostgreSQL nao encontrado. Debian/Ubuntu: sudo apt install postgresql. RHEL/Fedora: sudo dnf install postgresql-server"
}

# Unidade do Redis desta maquina (Debian: redis-server; RHEL/Fedora: redis), se o Redis for local.
redis_unit() {
    local url host unit
    url="$(env_value REDIS_URL)"
    host="$(printf '%s' "${url:-redis://127.0.0.1:6379/0}" | sed -E 's#^[a-z]+://([^@/]*@)?([^:/]+).*#\2#')"
    case "$host" in 127.0.0.1|localhost|::1) ;; *) return 0 ;; esac
    for unit in redis-server.service redis.service valkey.service; do
        if systemctl list-unit-files --no-legend "$unit" 2>/dev/null | grep -q .; then
            printf '%s' "$unit"; return 0
        fi
    done
}

# -- Setup ------------------------------------------------------------------

prepare_dirs() {
    install -d -o "$PORTAL_USER" -g "$PORTAL_GROUP" -m 750 "$DATA_DIR" "$PACKAGES_DIR" "$RUN_DIR"
}

install_backend() {
    local python="$1"
    if [ ! -x "$VENV_PYTHON" ]; then
        step "Criando virtualenv do backend ($("$python" --version))"
        as_user "$python" -m venv "$BACKEND_DIR/.venv" \
            || die "nao deu para criar o virtualenv. Debian/Ubuntu: sudo apt install python3.12-venv"
    fi
    step 'Instalando dependencias do backend'
    (cd "$BACKEND_DIR" && as_user "$VENV_PYTHON" -m pip install --quiet --disable-pip-version-check -r requirements/prod.txt)
}

init_env_file() {
    if [ -f "$ENV_FILE" ]; then
        step 'backend/.env ja existe; mantendo'
        return
    fi
    step 'Gerando backend/.env'
    local lan
    lan="$(lan_address)"
    {
        awk -v secret="$(new_secret 32)" -v pg_password="$(new_secret 24)" -v pg_port="$DEFAULT_PG_PORT" \
            -v storage="$PACKAGES_DIR" -v public_url="http://$lan:$API_PORT" '
            { sub(/\r$/, "") }
            /^SECRET_KEY=/         { print "SECRET_KEY=" secret; next }
            /^POSTGRES_PASSWORD=/  { print "POSTGRES_PASSWORD=" pg_password; next }
            /^POSTGRES_PORT=/      { print "POSTGRES_PORT=" pg_port; next }
            /^LOCAL_STORAGE_PATH=/ { print "LOCAL_STORAGE_PATH=" storage; next }
            /^BACKEND_PUBLIC_URL=/ { print "BACKEND_PUBLIC_URL=" public_url; next }
            { print }' "$BACKEND_DIR/.env.example"
        printf '\n# Cluster dedicado criado por scripts/portal.sh e iniciado pelo systemd.\nPORTAL_MANAGED_POSTGRES=true\n'
    } > "$ENV_FILE"
    chown "$PORTAL_USER:$PORTAL_GROUP" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
}

init_postgres() {
    managed_postgres || return 0
    [ -f "$PG_DATA/PG_VERSION" ] && return 0
    local bin password_file
    bin="$(find_pg_bin)"
    step "Criando cluster PostgreSQL dedicado em $PG_DATA (porta $(pg_port))"
    password_file="$RUN_DIR/pgpass.tmp"
    install -o "$PORTAL_USER" -g "$PORTAL_GROUP" -m 600 /dev/null "$password_file"
    printf '%s' "$(env_value POSTGRES_PASSWORD)" > "$password_file"
    as_user "$bin/initdb" -D "$PG_DATA" -U "$(env_value POSTGRES_USER)" -A scram-sha-256 \
        --pwfile="$password_file" -E UTF8 --locale=C >/dev/null || { rm -f "$password_file"; die 'initdb falhou.'; }
    rm -f "$password_file"
    # Socket na pasta do Portal: a padrao (/run/postgresql) e do usuario postgres da distribuicao.
    # A porta vem do backend/.env a cada start (run-postgres); a daqui so vale fora do systemd.
    printf "\nport = %s\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = '%s'\n" \
        "$(pg_port)" "$RUN_DIR" >> "$PG_DATA/postgresql.conf"
}

create_database() {
    managed_postgres || return 0
    local bin user database port
    bin="$(find_pg_bin)"
    user="$(env_value POSTGRES_USER)"
    database="$(env_value POSTGRES_DB)"
    port="$(pg_port)"
    assert_pg_port_free setup
    systemctl start "$PREFIX-postgres.service"
    if PGPASSWORD="$(env_value POSTGRES_PASSWORD)" as_user "$bin/psql" -h 127.0.0.1 -p "$port" -U "$user" \
        -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$database'" | grep -q 1; then
        return 0
    fi
    step "Criando o banco $database"
    PGPASSWORD="$(env_value POSTGRES_PASSWORD)" as_user "$bin/createdb" -h 127.0.0.1 -p "$port" -U "$user" "$database"
}

build_frontend() {
    step 'Instalando dependencias do frontend'
    local node_dir
    node_dir="$(dirname "$NODE")"
    (cd "$FRONTEND_DIR" && PATH="$node_dir:$PATH" as_user npm ci --include=dev --no-audit --no-fund)
    step 'Gerando build do frontend'
    (cd "$FRONTEND_DIR" && PATH="$node_dir:$PATH" as_user npm run build)
    # output: "standalone" nao copia _next/static nem public/ sozinho; sem isso
    # todo chunk JS/CSS responde 404 e a pagina quebra com ChunkLoadError.
    as_user rm -rf "$STANDALONE_DIR/.next/static"
    as_user cp -r "$FRONTEND_DIR/.next/static" "$STANDALONE_DIR/.next/static"
    if [ -d "$FRONTEND_DIR/public" ]; then as_user cp -r "$FRONTEND_DIR/public" "$STANDALONE_DIR/"; fi
}

# -- Servicos (systemd) --------------------------------------------------------

# Caminho entre aspas para Exec*= (systemd trata %, $, \ e " de forma especial).
q() {
    local value="$1"
    value="${value//\\/\\\\}"; value="${value//\"/\\\"}"
    value="${value//%/%%}"; value="${value//\$/\$\$}"
    printf '"%s"' "$value"
}
# Caminho sem aspas para WorkingDirectory=, ReadWritePaths= etc. (so % e especial).
p() { printf '%s' "${1//%/%%}"; }

common_service() { # descricao
    cat <<EOF
[Unit]
Description=Portal de Automacoes - $1
PartOf=$TARGET
EOF
}

hardening() {
    cat <<EOF
User=$PORTAL_USER
Group=$PORTAL_GROUP
UMask=0027
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
EOF
}

write_units() {
    local python_env redis pg_bin after wants script pg_unit=""
    redis="$(redis_unit || true)"
    # Pelo bash: o script nao precisa do bit de execucao (o Git no Windows nao o grava).
    script="/bin/bash $(q "$SCRIPT_PATH")"
    if managed_postgres; then pg_unit="$PREFIX-postgres.service "; fi
    python_env="Environment=$(q "PYTHONPATH=$BACKEND_DIR") PYTHONUNBUFFERED=1"
    after="network-online.target"
    wants="network-online.target"
    if [ -n "$redis" ]; then after="$after $redis"; wants="$wants $redis"; fi
    if managed_postgres; then after="$after $PREFIX-postgres.service"; fi

    step "Gravando servicos em $UNIT_DIR"

    {
        cat <<EOF
[Unit]
Description=Portal de Automacoes
After=network-online.target
Wants=network-online.target ${pg_unit}$PREFIX-migrate.service $PREFIX-api.service $PREFIX-worker.service $PREFIX-beat.service $PREFIX-frontend.service

[Install]
WantedBy=multi-user.target
EOF
    } > "$UNIT_DIR/$TARGET"

    if managed_postgres; then
        pg_bin="$(find_pg_bin)"
        {
            common_service 'PostgreSQL dedicado'
            cat <<EOF
After=network.target

[Service]
Type=simple
$(hardening)
# O script le POSTGRES_PORT do backend/.env e troca de processo para o postgres (exec).
ExecStart=$script run-postgres $(q "$pg_bin")
# A porta abre antes de o banco aceitar conexoes (ex.: recuperando de um desligamento brusco).
ExecStartPost=$script wait-postgres $(q "$pg_bin")
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=mixed
KillSignal=SIGINT
TimeoutStartSec=180
TimeoutStopSec=120
Restart=on-failure
RestartSec=5
EOF
        } > "$UNIT_DIR/$PREFIX-postgres.service"
    else
        rm -f "$UNIT_DIR/$PREFIX-postgres.service"
    fi

    {
        common_service 'migrations do banco'
        cat <<EOF
After=$after
Wants=$wants

[Service]
Type=oneshot
RemainAfterExit=yes
$(hardening)
WorkingDirectory=$(p "$BACKEND_DIR")
$python_env
ExecStart=$(q "$VENV_PYTHON") -m alembic upgrade head
TimeoutStartSec=900
EOF
    } > "$UNIT_DIR/$PREFIX-migrate.service"

    {
        common_service 'API'
        cat <<EOF
After=$after $PREFIX-migrate.service
Wants=$wants
Requires=$PREFIX-migrate.service

[Service]
Type=simple
$(hardening)
WorkingDirectory=$(p "$BACKEND_DIR")
$python_env
# O script le PORTAL_TLS_CERT/KEY do backend/.env e sobe o uvicorn (com HTTPS quando definidos).
ExecStart=$script run-api
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
TimeoutStopSec=30
EOF
    } > "$UNIT_DIR/$PREFIX-api.service"

    {
        common_service 'worker (Celery)'
        cat <<EOF
After=$after $PREFIX-migrate.service
Wants=$wants
Requires=$PREFIX-migrate.service

[Service]
Type=simple
$(hardening)
WorkingDirectory=$(p "$BACKEND_DIR")
$python_env
# --pool=threads: o mesmo do Windows (o banco e aberto na importacao; prefork dividiria as conexoes entre processos).
ExecStart=$(q "$VENV_PYTHON") -m celery -A workers.celery_app.celery_app worker --loglevel=info --pool=threads --concurrency=4 -Q critical,high,normal,low
Restart=on-failure
RestartSec=5
TimeoutStopSec=60
EOF
    } > "$UNIT_DIR/$PREFIX-worker.service"

    {
        common_service 'beat (Celery)'
        cat <<EOF
After=$after $PREFIX-migrate.service
Wants=$wants
Requires=$PREFIX-migrate.service

[Service]
Type=simple
$(hardening)
WorkingDirectory=$(p "$BACKEND_DIR")
$python_env
ExecStart=$(q "$VENV_PYTHON") -m celery -A workers.celery_app.celery_app beat --loglevel=info --schedule=$(q "$RUN_DIR/celerybeat-schedule") --pidfile=
Restart=on-failure
RestartSec=5
EOF
    } > "$UNIT_DIR/$PREFIX-beat.service"

    {
        common_service 'frontend'
        cat <<EOF
After=network-online.target $PREFIX-api.service
Wants=network-online.target

[Service]
Type=simple
$(hardening)
WorkingDirectory=$(p "$STANDALONE_DIR")
Environment=NODE_ENV=production HOSTNAME=0.0.0.0 PORT=$FRONTEND_PORT
ExecStart=$(q "$NODE") server.js
Restart=on-failure
RestartSec=5
EOF
    } > "$UNIT_DIR/$PREFIX-frontend.service"

    systemctl daemon-reload
    systemctl enable --quiet "$TARGET"
}

# -- Comandos -----------------------------------------------------------------

cmd_setup() {
    require_root setup
    resolve_user
    command -v curl >/dev/null || die 'curl nao encontrado. Debian/Ubuntu: sudo apt install curl'
    command -v systemctl >/dev/null || die 'systemd nao encontrado: este script precisa dele.'
    local python
    python="$(find_python)"
    NODE="$(find_node)"
    step "Servicos rodarao como $PORTAL_USER; dados em $DATA_DIR"
    prepare_dirs
    install_backend "$python"
    init_env_file
    init_postgres
    build_frontend
    write_units
    create_database
    [ -n "$(redis_unit || true)" ] || tcp_open 6379 \
        || warn 'Redis nao encontrado na porta 6379. Debian/Ubuntu: sudo apt install redis-server (fica so em 127.0.0.1).'
    step "Setup concluido. Suba o portal com: sudo $SELF start"
}

assert_installed() {
    [ -x "$VENV_PYTHON" ] && [ -f "$ENV_FILE" ] && [ -f "$STANDALONE_DIR/server.js" ] && [ -f "$UNIT_DIR/$TARGET" ] \
        || die "Portal ainda nao instalado. Rode primeiro: sudo $SELF setup"
}

api_health_url() {
    local cert key public_url
    cert="$(env_value PORTAL_TLS_CERT)"; key="$(env_value PORTAL_TLS_KEY)"
    public_url="$(env_value BACKEND_PUBLIC_URL)"
    # Com TLS, o health check usa o nome do certificado: a validacao nunca e desligada.
    if [ -n "$cert" ] && [ -n "$key" ]; then printf '%s/health' "${public_url%/}"; else printf 'http://127.0.0.1:%s/health' "$API_PORT"; fi
}

wait_started() {
    local health
    health="$(api_health_url)"
    wait_until 'a API' 60 http_ok "$health"
    wait_until 'o frontend' 60 http_ok "http://127.0.0.1:$FRONTEND_PORT/"
    local lan
    lan="$(lan_address)"
    echo
    printf '\033[32mPortal no ar: http://localhost:%s (rede local: http://%s:%s)\033[0m\n' "$FRONTEND_PORT" "$lan" "$FRONTEND_PORT"
    if [ -n "$(env_value PORTAL_TLS_CERT)" ]; then
        printf '\033[32mAPI em HTTPS: %s\033[0m\n' "$(env_value BACKEND_PUBLIC_URL)"
    else
        warn 'ATENCAO: API em HTTP, sem TLS. O modo direto do SDK recusa http://. Defina PORTAL_TLS_CERT e PORTAL_TLS_KEY no backend/.env.'
    fi
    echo "Logs: $SELF logs (journalctl -u '$PREFIX-*')"
}

start_target() {
    if ! systemctl "$1" "$TARGET"; then
        systemctl --no-pager --lines=0 status "$PREFIX-*" || true
        die "falha ao subir o portal. Veja: $SELF logs"
    fi
    # Requires= para em cascata: se a migration falhar, API, worker e beat nao sobem.
    systemctl is-active --quiet "$PREFIX-migrate.service" \
        || die "as migrations falharam. Veja: journalctl -u $PREFIX-migrate"
    wait_started
}

cmd_start() { require_root start; assert_installed; assert_pg_port_free start; step 'Iniciando o portal'; start_target start; }
cmd_restart() { require_root restart; assert_installed; assert_pg_port_free restart; step 'Reiniciando o portal (aplica migrations e build novos)'; start_target restart; }
cmd_stop() { require_root stop; step 'Parando o portal'; systemctl stop "$TARGET" "$PREFIX-*"; }

cmd_status() {
    local all=0 name state
    declare -A checks
    tcp_open "$(pg_port)" && checks[postgres]=1 || checks[postgres]=0
    tcp_open 6379 && checks[redis]=1 || checks[redis]=0
    http_ok "$(api_health_url)" && checks[api]=1 || checks[api]=0
    systemctl is-active --quiet "$PREFIX-worker.service" && checks[worker]=1 || checks[worker]=0
    systemctl is-active --quiet "$PREFIX-beat.service" && checks[beat]=1 || checks[beat]=0
    http_ok "http://127.0.0.1:$FRONTEND_PORT/" && checks[frontend]=1 || checks[frontend]=0
    for name in postgres redis api worker beat frontend; do
        if [ "${checks[$name]}" = 1 ]; then state=UP; else state=DOWN; all=1; fi
        printf '%-10s%s\n' "$name" "$state"
    done
    return "$all"
}

cmd_logs() {
    if [ -n "${1:-}" ]; then
        [[ " ${SERVICES[*]} " == *" $1 "* ]] || die "servico desconhecido: $1 (use: ${SERVICES[*]})"
        exec journalctl -u "$PREFIX-$1" -f -n 200
    fi
    exec journalctl -u "$PREFIX-*" -f -n 200
}

cmd_open_firewall() {
    require_root open-firewall
    local interface network
    interface="$(ip -4 route show default 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit }}')"
    network="$(ip -o -4 addr show dev "$interface" 2>/dev/null | awk '{print $4; exit}')"
    [ -n "$network" ] || die 'nao achei a subrede local.'
    network="$(python3 -c 'import ipaddress, sys; print(ipaddress.ip_interface(sys.argv[1]).network)' "$network")"
    if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
        ufw allow from "$network" to any port "$FRONTEND_PORT,$API_PORT" proto tcp comment 'Portal de Automacoes' >/dev/null
    elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
        local port
        for port in "$FRONTEND_PORT" "$API_PORT"; do
            firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=$network port port=$port protocol=tcp accept" >/dev/null
        done
        firewall-cmd --reload >/dev/null
    else
        step "Nenhum firewall ativo (ufw ou firewalld): as portas $FRONTEND_PORT e $API_PORT ja estao acessiveis."
        return 0
    fi
    step "Portas $FRONTEND_PORT e $API_PORT liberadas para $network"
}

cmd_remove_services() {
    require_root remove-services
    step 'Parando e removendo os servicos (dados, banco e backend/.env ficam)'
    systemctl disable --now --quiet "$TARGET" 2>/dev/null || true
    systemctl stop "$PREFIX-*" 2>/dev/null || true
    rm -f "$UNIT_DIR/$TARGET" "$UNIT_DIR/$PREFIX"-*.service
    systemctl daemon-reload
}

# Publica o Portal num nome da intranet pelo nginx desta maquina (infra/nginx/portal-automacoes.conf).
cmd_nginx() {
    require_root nginx
    local name="${1:-}"
    [ -n "$name" ] || die "informe o nome: sudo $SELF nginx portaldeautomacoes.intranet.biason.net"
    [[ "$name" =~ ^[A-Za-z0-9.-]+$ ]] || die "nome invalido: $name"
    command -v nginx >/dev/null || die 'nginx nao encontrado. Debian/Ubuntu: sudo apt install nginx'
    local template="$REPO_ROOT/infra/nginx/portal-automacoes.conf" dest link="" max api_scheme=http
    [ -f "$template" ] || die "modelo nao encontrado: $template"
    if [ -d /etc/nginx/sites-available ]; then
        dest=/etc/nginx/sites-available/portal-automacoes.conf
        link=/etc/nginx/sites-enabled/portal-automacoes.conf
    else
        dest=/etc/nginx/conf.d/portal-automacoes.conf
    fi
    max="$(env_value MAX_UPLOAD_SIZE_MB)"
    [[ "$max" =~ ^[0-9]+$ ]] || max=200
    # API com HTTPS: o nginx tambem fala HTTPS com ela (na mesma maquina, sem conferir o nome).
    if [ -n "$(env_value PORTAL_TLS_CERT)" ]; then api_scheme=https; fi

    local backup=""
    if [ -f "$dest" ]; then backup="$(mktemp)"; cp "$dest" "$backup"; fi
    step "Gravando $dest"
    {
        printf '# Gerado por scripts/portal.sh nginx a partir de infra/nginx/portal-automacoes.conf.\n'
        sed -e '1,/^$/d' \
            -e "s/portaldeautomacoes\.intranet\.biason\.net/$name/" \
            -e "s/client_max_body_size [0-9]*m;/client_max_body_size $((max + 56))m;/" \
            -e "s#proxy_pass http://portal_automacoes_api;#proxy_pass $api_scheme://portal_automacoes_api;#" \
            "$template"
    } > "$dest"
    if [ -n "$link" ]; then ln -sf "$dest" "$link"; fi
    if ! nginx -t >/dev/null 2>&1; then
        nginx -t || true
        if [ -n "$backup" ]; then mv "$backup" "$dest"; else rm -f "$dest" ${link:+"$link"}; fi
        die 'a configuracao do nginx nao passou no teste (nginx -t); nada mudou.'
    fi
    rm -f "$backup"
    systemctl enable --quiet nginx
    systemctl reload-or-restart nginx

    # Links dos e-mails (convite, senha, pendencias) passam a usar o nome.
    if [ -f "$ENV_FILE" ] && [ "$(env_value FRONTEND_URL)" != "http://$name" ]; then
        local owner
        owner="$(stat -c %U:%G "$ENV_FILE")"
        if grep -q '^FRONTEND_URL=' "$ENV_FILE"; then
            sed -i "s#^FRONTEND_URL=.*#FRONTEND_URL=http://$name#" "$ENV_FILE"
        else
            printf 'FRONTEND_URL=http://%s\n' "$name" >> "$ENV_FILE"
        fi
        chown "$owner" "$ENV_FILE"; chmod 600 "$ENV_FILE"
        step "FRONTEND_URL=http://$name no backend/.env (vale depois de: sudo $SELF restart)"
    fi

    step "Portal publicado em http://$name"
    if ! getent hosts "$name" >/dev/null; then
        warn "O nome $name ainda nao existe no DNS. Peca ao TI um registro A: $name -> $(lan_address)"
    fi
}

# Internos: chamados pelos servicos do systemd.

cmd_run_api() {
    local cert key public_url
    cert="$(env_value PORTAL_TLS_CERT)"; key="$(env_value PORTAL_TLS_KEY)"
    public_url="$(env_value BACKEND_PUBLIC_URL)"
    local args=(-m uvicorn main:app --host 0.0.0.0 --port "$API_PORT")
    if [ -n "$cert" ] || [ -n "$key" ]; then
        [ -n "$cert" ] && [ -n "$key" ] || die 'defina PORTAL_TLS_CERT e PORTAL_TLS_KEY juntos no backend/.env.'
        [ -r "$cert" ] && [ -r "$key" ] || die "certificado ou chave TLS nao encontrado ou sem leitura para $(id -un): $cert, $key"
        [[ "$public_url" == https://* ]] || die 'com TLS, BACKEND_PUBLIC_URL precisa ser https:// com o nome que esta no certificado.'
        # O padrao do uvicorn (--ssl-ciphers TLSv1) so oferece cifras CBC com SHA-1: um cliente
        # TLS 1.2 moderno nao negocia. Aqui so AEAD com troca de chave efemera.
        args+=(--ssl-certfile "$cert" --ssl-keyfile "$key" --ssl-ciphers "$TLS_CIPHERS")
    fi
    # nginx em outra maquina: a API so aceita o IP real (X-Forwarded-For) vindo dela.
    # Sem PORTAL_PROXY_IPS o uvicorn ja confia so em 127.0.0.1 (nginx nesta maquina).
    local proxy_ips
    proxy_ips="$(env_value PORTAL_PROXY_IPS)"
    if [ -n "$proxy_ips" ]; then args+=(--forwarded-allow-ips "127.0.0.1,$proxy_ips"); fi
    cd "$BACKEND_DIR"
    exec "$VENV_PYTHON" "${args[@]}"
}

cmd_run_postgres() {
    exec "$1/postgres" -D "$PG_DATA" -p "$(pg_port)" -k "$RUN_DIR"
}

cmd_wait_postgres() {
    local bin="$1" port deadline=$((SECONDS + 150))
    port="$(pg_port)"
    while [ "$SECONDS" -lt "$deadline" ]; do
        # Pelo socket na pasta do Portal: so o banco do Portal responde ali, nunca outro na mesma porta.
        "$bin/pg_isready" -h "$RUN_DIR" -p "$port" -q && return 0
        sleep 0.5
    done
    die 'o PostgreSQL nao passou a aceitar conexoes.'
}

case "${1:-status}" in
    setup) cmd_setup ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    logs) cmd_logs "${2:-}" ;;
    open-firewall) cmd_open_firewall ;;
    remove-services) cmd_remove_services ;;
    nginx) cmd_nginx "${2:-}" ;;
    run-api) cmd_run_api ;;
    run-postgres) cmd_run_postgres "${2:?}" ;;
    wait-postgres) cmd_wait_postgres "${2:?}" ;;
    *) sed -n '2,/^set -euo/p' "$SCRIPT_PATH" | sed '$d; s/^# \{0,1\}//'; exit 2 ;;
esac
