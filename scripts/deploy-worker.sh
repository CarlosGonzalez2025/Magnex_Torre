#!/bin/bash

# ============================================
# Script de Despliegue: Backend Worker
# ============================================
#
# Este script despliega el worker backend que
# monitorea y guarda alertas 24/7 de forma
# independiente del frontend.
#
# Uso: ./scripts/deploy-worker.sh
# ============================================

set -e  # Exit on error

echo "🚀 Desplegando Backend Worker..."
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Verificar Supabase CLI
echo "📋 Step 1: Verificando Supabase CLI..."
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI no encontrado${NC}"
    echo ""
    echo "Instalar con:"
    echo "  macOS/Linux: brew install supabase/tap/supabase"
    echo "  Windows: scoop install supabase"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Supabase CLI instalado${NC}"
supabase --version
echo ""

# Step 2: Verificar que estamos en el directorio correcto
echo "📂 Step 2: Verificando directorio..."
if [ ! -d "supabase/functions/alert-monitor" ]; then
    echo -e "${RED}❌ Directorio incorrecto${NC}"
    echo "Por favor ejecutar desde la raíz del proyecto"
    exit 1
fi
echo -e "${GREEN}✅ Directorio correcto${NC}"
echo ""

# Step 3: Verificar que hay proyecto vinculado
echo "🔗 Step 3: Verificando proyecto Supabase..."
if [ ! -f ".supabase/config.toml" ]; then
    echo -e "${YELLOW}⚠️  Proyecto no vinculado${NC}"
    echo ""
    echo "Vincular proyecto con:"
    echo "  supabase link --project-ref YOUR_PROJECT_REF"
    echo ""
    read -p "¿Deseas continuar de todos modos? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✅ Proyecto vinculado${NC}"
fi
echo ""

# Step 4: Desplegar función
echo "🚀 Step 4: Desplegando Edge Function..."
supabase functions deploy alert-monitor --no-verify-jwt

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Función desplegada exitosamente${NC}"
else
    echo -e "${RED}❌ Error al desplegar función${NC}"
    exit 1
fi
echo ""

# Step 5: Listar funciones
echo "📝 Step 5: Verificando funciones desplegadas..."
supabase functions list
echo ""

# Step 6: Probar función
echo "🧪 Step 6: ¿Deseas probar la función ahora?"
read -p "(Requiere SUPABASE_ANON_KEY) (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Ingresa tu SUPABASE_ANON_KEY:"
    read -s ANON_KEY
    echo ""

    if [ -f ".supabase/config.toml" ]; then
        PROJECT_REF=$(grep 'project_id' .supabase/config.toml | cut -d'"' -f2)
        echo "Ejecutando función..."
        echo ""

        curl -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/alert-monitor" \
             -H "Authorization: Bearer ${ANON_KEY}" \
             -H "Content-Type: application/json" \
             --silent --show-error | jq '.'

        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}✅ Función ejecutada correctamente${NC}"
        else
            echo ""
            echo -e "${RED}❌ Error al ejecutar función${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  No se pudo determinar PROJECT_REF${NC}"
        echo "Ejecutar manualmente con:"
        echo "curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor' \\"
        echo "  -H 'Authorization: Bearer YOUR_ANON_KEY'"
    fi
fi
echo ""

# Step 7: Instrucciones de cron job
echo "⏰ Step 7: Configurar Cron Job"
echo "================================"
echo ""
echo "Para que el worker se ejecute automáticamente cada 5 minutos,"
echo "configura un cron job en Supabase Dashboard:"
echo ""
echo "1. Ir a: https://supabase.com/dashboard/project/YOUR_PROJECT_REF/database/cron-jobs"
echo "2. Click en 'Create a new Cron Job'"
echo "3. Configurar:"
echo "   - Name: alert-monitor-cron"
echo "   - Schedule: */5 * * * *"
echo "   - Command:"
echo ""
echo "   SELECT net.http_post("
echo "     url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/alert-monitor',"
echo "     headers:='{\"Content-Type\": \"application/json\", \"Authorization\": \"Bearer YOUR_ANON_KEY\"}'::jsonb"
echo "   );"
echo ""
echo "4. Click en 'Save'"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE: Reemplazar YOUR_PROJECT_REF y YOUR_ANON_KEY${NC}"
echo ""

# Step 8: Verificar logs
echo "📊 Step 8: Monitoreo de Logs"
echo "================================"
echo ""
echo "Para ver logs en tiempo real:"
echo "  supabase functions logs alert-monitor --tail"
echo ""
echo "Para ver logs históricos:"
echo "  supabase functions logs alert-monitor --limit 100"
echo ""

# Finalización
echo ""
echo "================================"
echo -e "${GREEN}✅ Despliegue completado${NC}"
echo "================================"
echo ""
echo "📖 Documentación completa:"
echo "   docs/BACKEND_WORKER_SETUP.md"
echo ""
echo "🔍 Validar funcionamiento:"
echo "   - Esperar 5 minutos"
echo "   - Verificar saved_alerts en Supabase"
echo "   - Query: SELECT * FROM saved_alerts WHERE saved_by = 'Sistema (Auto)' ORDER BY saved_at DESC LIMIT 10;"
echo ""
echo "🎉 El sistema ahora funciona 24/7 sin necesidad de usuarios conectados!"
echo ""
