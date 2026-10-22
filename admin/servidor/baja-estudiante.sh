#!/bin/bash
# Da de baja a un estudiante: apaga su CRM y borra su carpeta (incluida la
# sesión de WhatsApp), su sitio, su SSL, su llave y su usuario.
# Sus datos en Supabase NO se tocan (son de su cuenta).
# Uso (como root): baja-estudiante.sh ana
set -euo pipefail
NOMBRE="${1:?Uso: $0 nombre}"
DOMINIO="$(cat /etc/crm/dominio)"
read -r -p "¿Seguro que querés borrar el CRM de $NOMBRE? Escribí su nombre para confirmar: " conf
[ "$conf" = "$NOMBRE" ] || { echo "Cancelado."; exit 1; }

systemctl disable --now "crm@$NOMBRE" 2>/dev/null || true
rm -f "/etc/nginx/sites-enabled/crm-$NOMBRE" "/etc/nginx/sites-available/crm-$NOMBRE"
nginx -t -q && systemctl reload nginx
certbot delete --cert-name "$NOMBRE.$DOMINIO" --non-interactive 2>/dev/null || true
rm -f "/etc/sudoers.d/crm-$NOMBRE" "/root/llaves/$NOMBRE" "/root/llaves/$NOMBRE.pub" "/root/fichas/$NOMBRE.txt"
userdel "crm-$NOMBRE" 2>/dev/null || true
rm -rf "/srv/crm/$NOMBRE"
echo "✓ $NOMBRE dado de baja."
