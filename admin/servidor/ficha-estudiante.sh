#!/bin/bash
# Escribe (o reescribe) la ficha de uno o varios estudiantes en
# /root/fichas/<nombre>.txt, a partir de lo que ya tiene el servidor
# (su llave de despliegue, la IP y el dominio). No cambia ninguna llave.
# Uso (como root):  ficha-estudiante.sh ana pedro
set -euo pipefail

DOMINIO="$(cat /etc/crm/dominio)"
IP="$(cat /etc/crm/ip)"

ficha() {
  local NOMBRE="$1"
  [ -f "/root/llaves/$NOMBRE" ] || { echo "✗ $NOMBRE no está dado de alta."; return 1; }
  mkdir -p /root/fichas
  {
    echo "=============================================="
    echo " FICHA DE $NOMBRE"
    echo " Tu CRM: https://$NOMBRE.$DOMINIO"
    echo "=============================================="
    echo
    echo "PERSONAL: no la compartas con nadie ni la pegues en ningún grupo."
    echo
    echo "Vas a cargar 3 secretos en tu repo de GitHub:"
    echo "Settings > Secrets and variables > Actions > New repository secret"
    echo
    echo "En cada secreto hay DOS campos:"
    echo "  Name    el campo chico de arriba: el nombre, ESCRIBILO A MANO"
    echo "  Secret  el cuadro grande de abajo: el valor, COPIALO de esta ficha"
    echo
    echo "Copiá SOLO la línea (o el bloque) del valor, sin ninguna palabra de más."
    echo
    echo "####################################################"
    echo "SECRETO 1 de 3"
    echo "Name (escribilo a mano):  DEPLOY_HOST"
    echo "Secret (copiá la línea de abajo, solita):"
    echo
    echo "$IP"
    echo
    echo "####################################################"
    echo "SECRETO 2 de 3"
    echo "Name (escribilo a mano):  DEPLOY_USER"
    echo "Secret (copiá la línea de abajo, solita):"
    echo
    echo "crm-$NOMBRE"
    echo
    echo "####################################################"
    echo "SECRETO 3 de 3"
    echo "Name (escribilo a mano):  DEPLOY_KEY"
    echo "Secret (copiá TODO el bloque de abajo, desde la línea que dice BEGIN"
    echo "hasta la línea que dice END, esas dos líneas incluidas):"
    echo
    cat "/root/llaves/$NOMBRE"
    echo
    echo "####################################################"
    echo "Listo. Cuando tengas los 6 secretos (estos 3 más los 3 de Supabase),"
    echo "andá a Actions > Publicar CRM > Run workflow."
  } > "/root/fichas/$NOMBRE.txt"
  chmod 600 "/root/fichas/$NOMBRE.txt"
  echo "✓ Ficha de $NOMBRE actualizada"
}

[ "$#" -gt 0 ] || { echo "Uso: $0 nombre1 [nombre2 ...]"; exit 1; }
for n in "$@"; do ficha "$n" || true; done
