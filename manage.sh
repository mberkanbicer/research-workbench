#!/bin/bash

# Research Workbench Management Script

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# PID files
API_PID_FILE=".api.pid"
WEB_PID_FILE=".web.pid"

DATABASE_URL="${DATABASE_URL:-postgresql://research:research@localhost:5433/research_workbench?schema=public}"
REDIS_URL="${REDIS_URL:-redis://localhost:6380}"
# mock = deterministic fixtures, no API keys. Override: SEARCH_PROVIDER=web ./manage.sh start
SEARCH_PROVIDER="${SEARCH_PROVIDER:-mock}"

function check_dependencies() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: docker is not installed.${NC}"
        exit 1
    fi
    if ! command -v pnpm &> /dev/null; then
        echo -e "${RED}Error: pnpm is not installed.${NC}"
        exit 1
    fi
}

function wait_for_postgres() {
    echo -e "${YELLOW}Waiting for PostgreSQL...${NC}"
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if docker exec research_workbench_postgres pg_isready -U research -d research_workbench &>/dev/null; then
            return 0
        fi
        attempts=$((attempts + 1))
        sleep 1
    done
    echo -e "${RED}PostgreSQL did not become ready in time.${NC}"
    return 1
}

function db_needs_setup() {
    local count
    count=$(docker exec research_workbench_postgres psql -U research -d research_workbench -tAc \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='User';" 2>/dev/null || echo "0")
    if [ "$count" = "0" ]; then
        return 0
    fi
    local users
    users=$(docker exec research_workbench_postgres psql -U research -d research_workbench -tAc \
        'SELECT COUNT(*) FROM "User";' 2>/dev/null || echo "0")
    [ "$users" = "0" ]
}

function setup_db() {
    echo -e "${YELLOW}Running database setup (migrate + seed)...${NC}"
    wait_for_postgres || exit 1
    (cd apps/api && DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy) || exit 1
    (cd apps/api && DATABASE_URL="$DATABASE_URL" npx prisma db seed) || exit 1
    echo -e "${GREEN}Database setup complete.${NC}"
}

function start_infra() {
    echo -e "${YELLOW}Starting infrastructure (PostgreSQL, Redis)...${NC}"
    docker compose up -d
    echo -e "${GREEN}Infrastructure started.${NC}"
}

function stop_infra() {
    echo -e "${YELLOW}Stopping infrastructure...${NC}"
    docker compose down
    echo -e "${GREEN}Infrastructure stopped.${NC}"
}

function start_apps() {
    echo -e "${YELLOW}Starting applications...${NC}"

    # Start API
    if [ -f "$API_PID_FILE" ] && kill -0 $(cat "$API_PID_FILE") 2>/dev/null; then
        echo -e "${YELLOW}API is already running.${NC}"
    else
        echo "Starting API (SEARCH_PROVIDER=${SEARCH_PROVIDER})..."
        (cd apps/api && SEARCH_PROVIDER="$SEARCH_PROVIDER" DATABASE_URL="$DATABASE_URL" REDIS_URL="$REDIS_URL" pnpm run dev > ../../api.log 2>&1) &
        echo $! > "$API_PID_FILE"
        echo -e "${GREEN}API started in background (PID: $(cat $API_PID_FILE), log: api.log)${NC}"
    fi

    # Start Web
    if [ -f "$WEB_PID_FILE" ] && kill -0 $(cat "$WEB_PID_FILE") 2>/dev/null; then
        echo -e "${YELLOW}Web is already running.${NC}"
    else
        echo "Starting Web..."
        (cd apps/web && pnpm run dev > ../../web.log 2>&1) &
        echo $! > "$WEB_PID_FILE"
        echo -e "${GREEN}Web started in background (PID: $(cat $WEB_PID_FILE), log: web.log)${NC}"
    fi
}

function stop_apps() {
    echo -e "${YELLOW}Stopping applications...${NC}"

    if [ -f "$API_PID_FILE" ]; then
        PID=$(cat "$API_PID_FILE")
        if kill -0 $PID 2>/dev/null; then
            echo "Stopping API (PID: $PID)..."
            kill $PID
        fi
        rm "$API_PID_FILE"
    fi

    if [ -f "$WEB_PID_FILE" ]; then
        PID=$(cat "$WEB_PID_FILE")
        if kill -0 $PID 2>/dev/null; then
            echo "Stopping Web (PID: $PID)..."
            kill $PID
        fi
        rm "$WEB_PID_FILE"
    fi

    pkill -f "tsx watch src/server.ts" 2>/dev/null
    pkill -f "next dev" 2>/dev/null

    echo -e "${GREEN}Applications stopped.${NC}"
}

function status() {
    echo -e "${YELLOW}--- Project Status ---${NC}"

    echo -e "${YELLOW}Infrastructure:${NC}"
    docker compose ps

    echo -e "\n${YELLOW}Applications:${NC}"
    if [ -f "$API_PID_FILE" ] && kill -0 $(cat "$API_PID_FILE") 2>/dev/null; then
        echo -e "API: ${GREEN}Running${NC} (PID: $(cat $API_PID_FILE))"
    else
        echo -e "API: ${RED}Stopped${NC}"
    fi

    if [ -f "$WEB_PID_FILE" ] && kill -0 $(cat "$WEB_PID_FILE") 2>/dev/null; then
        echo -e "Web: ${GREEN}Running${NC} (PID: $(cat $WEB_PID_FILE))"
    else
        echo -e "Web: ${RED}Stopped${NC}"
    fi
}

function health_check() {
    echo -e "${YELLOW}--- Health Check ---${NC}"

    if docker exec research_workbench_postgres pg_isready -U research -d research_workbench &>/dev/null; then
        echo -e "PostgreSQL: ${GREEN}healthy${NC}"
    else
        echo -e "PostgreSQL: ${RED}unreachable${NC}"
    fi

    if docker exec research_workbench_redis redis-cli ping 2>/dev/null | grep -q PONG; then
        echo -e "Redis: ${GREEN}healthy${NC}"
    else
        echo -e "Redis: ${RED}unreachable${NC}"
    fi

    if curl -sf http://localhost:4000/health >/dev/null 2>&1; then
        echo -e "API /health: ${GREEN}ok${NC}"
    else
        echo -e "API /health: ${RED}failed${NC}"
    fi

    if curl -sf http://localhost:4000/ready >/dev/null 2>&1; then
        echo -e "API /ready: ${GREEN}ok${NC}"
    else
        echo -e "API /ready: ${RED}failed${NC}"
    fi
}

function logs() {
    echo -e "${YELLOW}Tailing logs (Ctrl+C to stop)...${NC}"
    echo -e "${YELLOW}--- Docker logs ---${NC}"
    docker compose logs --tail=50
    echo -e "\n${YELLOW}--- API log ---${NC}"
    if [ -f "api.log" ]; then
        tail -50 api.log
    else
        echo -e "${RED}No api.log found.${NC}"
    fi
    echo -e "\n${YELLOW}--- Web log ---${NC}"
    if [ -f "web.log" ]; then
        tail -50 web.log
    else
        echo -e "${RED}No web.log found.${NC}"
    fi
}

function db_reset() {
    echo -e "${YELLOW}Resetting database...${NC}"
    docker compose down postgres
    docker compose up -d postgres
    wait_for_postgres || exit 1
    (cd apps/api && DATABASE_URL="$DATABASE_URL" npx prisma migrate dev --name reset)
    echo -e "${GREEN}Database reset complete.${NC}"
}

function seed() {
    echo -e "${YELLOW}Seeding database...${NC}"
    (cd apps/api && DATABASE_URL="$DATABASE_URL" npx prisma db seed)
    echo -e "${GREEN}Seed complete.${NC}"
}

function build_all() {
    echo -e "${YELLOW}Building all packages...${NC}"
    NODE_ENV=production pnpm build
    echo -e "${GREEN}Build complete.${NC}"
}

function setup_pgvector() {
    echo -e "${YELLOW}Applying pgvector column migration...${NC}"
    wait_for_postgres || exit 1
    docker exec -i research_workbench_postgres psql -U research -d research_workbench \
        < infra/postgres/migrations/0002_pgvector_column.sql || exit 1
    echo -e "${GREEN}pgvector column migration complete. Set PGVECTOR_ENABLED=true in .env${NC}"
}

function backfill_embeddings() {
    echo -e "${YELLOW}Backfilling embeddings (requires EMBEDDING_ENABLED=true)...${NC}"
    wait_for_postgres || exit 1
    (cd apps/api && EMBEDDING_ENABLED="${EMBEDDING_ENABLED:-true}" DATABASE_URL="$DATABASE_URL" pnpm backfill-embeddings "$@") || exit 1
    echo -e "${GREEN}Embedding backfill complete.${NC}"
}

function usage() {
    echo "Usage: $0 {start [--setup]|stop|restart|status|health|logs|setup|pgvector|backfill-embeddings|db:reset|seed|build}"
    echo ""
    echo "  start [--setup]      Start infra + apps. --setup runs migrate+seed if DB is empty."
    echo "  setup                Run prisma migrate deploy + seed"
    echo "  pgvector             Convert SourceEmbedding.embedding to vector(768) + index"
    echo "  backfill-embeddings  Index existing claims/evidence (EMBEDDING_ENABLED=true)"
    echo "  health               Check postgres, redis, and API health endpoints"
    exit 1
}

check_dependencies

case "$1" in
    start)
        FORCE_SETUP=false
        if [ "$2" = "--setup" ]; then
            FORCE_SETUP=true
        fi
        start_infra
        wait_for_postgres || exit 1
        if [ "$FORCE_SETUP" = true ] || db_needs_setup; then
            setup_db
        fi
        start_apps
        ;;
    stop)
        stop_apps
        stop_infra
        ;;
    restart)
        $0 stop
        shift
        $0 start "$@"
        ;;
    status)
        status
        ;;
    health)
        health_check
        ;;
    logs)
        logs
        ;;
    setup)
        setup_db
        ;;
    pgvector)
        setup_pgvector
        ;;
    backfill-embeddings)
        shift
        backfill_embeddings "$@"
        ;;
    db:reset)
        db_reset
        ;;
    seed)
        seed
        ;;
    build)
        build_all
        ;;
    *)
        usage
        ;;
esac