#!/bin/bash
# ── Staging Deployment Script ──────────────────────────────────────────────
# Deploys the full stack locally for staging/QA.
# Infrastructure runs in Docker; apps run via pnpm for hot-reload.
#
# Usage:
#   ./deploy-staging.sh            # Full deploy
#   ./deploy-staging.sh up         # Start everything
#   ./deploy-staging.sh down       # Stop everything
#   ./deploy-staging.sh logs       # Follow logs
#   ./deploy-staging.sh status     # Check status
#   ./deploy-staging.sh rebuild    # Rebuild + restart

set -euo pipefail
cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

API_PID_FILE=".staging.api.pid"
WEB_PID_FILE=".staging.web.pid"
API_LOG="staging-api.log"
WEB_LOG="staging-web.log"

echo -e "${YELLOW}═══ Research Workbench — Staging Deployment ═══${NC}"

case "${1:-all}" in
  up|start)
    # Start infrastructure
    echo -e "${YELLOW}Starting infrastructure (PostgreSQL, Redis)...${NC}"
    docker compose up -d
    echo -e "${GREEN}Infrastructure ready.${NC}"

    # Wait for DB
    echo -e "${YELLOW}Waiting for PostgreSQL...${NC}"
    sleep 3

    # Run migrations
    echo -e "${YELLOW}Running database migrations...${NC}"
    (cd "${PROJECT_ROOT}/apps/api" && NODE_ENV=development npx prisma migrate deploy 2>/dev/null || npx prisma migrate dev --skip-generate 2>&1 | tail -3)
    echo -e "${GREEN}Migrations complete.${NC}"

    # Start API
    echo -e "${YELLOW}Starting API (port 4000)...${NC}"
    (cd "${PROJECT_ROOT}/apps/api" && pnpm dev > "${PROJECT_ROOT}/${API_LOG}" 2>&1) &
    echo $! > "${PROJECT_ROOT}/${API_PID_FILE}"
    echo -e "${GREEN}API started (PID: $(cat ${PROJECT_ROOT}/${API_PID_FILE}), log: ${API_LOG})${NC}"

    # Start Web
    echo -e "${YELLOW}Starting Web (port 3000)...${NC}"
    (cd "${PROJECT_ROOT}/apps/web" && pnpm dev > "${PROJECT_ROOT}/${WEB_LOG}" 2>&1) &
    echo $! > "${PROJECT_ROOT}/${WEB_PID_FILE}"
    echo -e "${GREEN}Web started (PID: $(cat ${PROJECT_ROOT}/${WEB_PID_FILE}), log: ${WEB_LOG})${NC}"

    echo ""
    echo -e "${GREEN}═══ Staging environment ready ═══${NC}"
    echo -e "  API:  ${YELLOW}http://localhost:4000/health${NC}"
    echo -e "  Web:  ${YELLOW}http://localhost:3000${NC}"
    echo -e "  Logs: ${YELLOW}$0 logs${NC}"
    ;;

  down|stop)
    echo -e "${YELLOW}Stopping applications...${NC}"

    if [ -f "${PROJECT_ROOT}/${API_PID_FILE}" ]; then
      kill $(cat "${PROJECT_ROOT}/${API_PID_FILE}") 2>/dev/null || true
      rm "${PROJECT_ROOT}/${API_PID_FILE}"
      echo -e "${GREEN}API stopped.${NC}"
    fi

    if [ -f "${PROJECT_ROOT}/${WEB_PID_FILE}" ]; then
      kill $(cat "${PROJECT_ROOT}/${WEB_PID_FILE}") 2>/dev/null || true
      rm "${PROJECT_ROOT}/${WEB_PID_FILE}"
      echo -e "${GREEN}Web stopped.${NC}"
    fi

    # Kill any remaining tsx/next processes
    pkill -f "tsx watch src/server.ts" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true

    echo -e "${YELLOW}Stopping infrastructure...${NC}"
    docker compose down
    echo -e "${GREEN}All services stopped.${NC}"
    ;;

  rebuild)
    $0 down
    $0 up
    ;;

  logs)
    echo -e "${YELLOW}Following logs (Ctrl+C to stop)...${NC}"
    echo -e "${YELLOW}━━━ API log ━━━${NC}"
    if [ -f "${PROJECT_ROOT}/${API_LOG}" ]; then
      tail -f "${PROJECT_ROOT}/${API_LOG}" &
      API_TAIL_PID=$!
    fi
    echo -e "${YELLOW}━━━ Web log ━━━${NC}"
    if [ -f "${PROJECT_ROOT}/${WEB_LOG}" ]; then
      tail -f "${PROJECT_ROOT}/${WEB_LOG}" &
      WEB_TAIL_PID=$!
    fi
    trap 'kill ${API_TAIL_PID:-} ${WEB_TAIL_PID:-} 2>/dev/null; exit 0' INT TERM
    wait
    ;;

  status)
    echo -e "${YELLOW}Staging status:${NC}"
    docker compose ps 2>/dev/null || echo -e "${RED}Infrastructure not running${NC}"
    echo ""
    if [ -f "${PROJECT_ROOT}/${API_PID_FILE}" ] && kill -0 $(cat "${PROJECT_ROOT}/${API_PID_FILE}") 2>/dev/null; then
      echo -e "  API:  ${GREEN}Running${NC} (PID: $(cat ${PROJECT_ROOT}/${API_PID_FILE}))"
    else
      echo -e "  API:  ${RED}Stopped${NC}"
    fi
    if [ -f "${PROJECT_ROOT}/${WEB_PID_FILE}" ] && kill -0 $(cat "${PROJECT_ROOT}/${WEB_PID_FILE}") 2>/dev/null; then
      echo -e "  Web:  ${GREEN}Running${NC} (PID: $(cat ${PROJECT_ROOT}/${WEB_PID_FILE}))"
    else
      echo -e "  Web:  ${RED}Stopped${NC}"
    fi
    ;;

  test)
    echo -e "${YELLOW}Running all tests...${NC}"
    pnpm -r test 2>&1 | grep -E "Test Files|Tests|FAIL|passed"
    echo -e "${GREEN}Tests complete.${NC}"
    ;;

  seed)
    echo -e "${YELLOW}Seeding database...${NC}"
    (cd "${PROJECT_ROOT}/apps/api" && npx tsx prisma/seed.ts)
    echo -e "${GREEN}Seed complete.${NC}"
    ;;

  all|"")
    $0 up
    ;;

  *)
    echo "Usage: $0 {up|down|rebuild|logs|status|test|seed}"
    exit 1
    ;;
esac
