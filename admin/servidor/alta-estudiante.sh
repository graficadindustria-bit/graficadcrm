#!/bin/bash
# Da de alta a uno o varios estudiantes en el servidor.
#
# Uso (como root):  alta-estudiante.sh ana pedro mariajose
#
# Por cada nombre crea: su usuario de Linux (crm-<nombre>), su carpeta en
# /srv/crm/<nombre>, un puerto propio, su sitio en nginx con SSL en
# <nombre>.<dominio>, y una llave de despliegue que solo sirve para publicar
# su CRM. Al final deja su ficha en /root/fichas/<nombre>.txt con los 3
# secretos que tiene que cargar en GitHub.
set -euo pipefail

DOMINIO="$(cat /etc/crm/dominio)"
IP="$(cat /etc/crm/ip)"
PUERTO_INICIAL=4001

siguiente_puerto() {
  local max=$((PUERTO_INICIAL - 1))
  for f in /srv/crm/*/puerto; do
    [ -f "$f" ] || continue
    local p; p="$(cat "$f")"
    [ "$p" -gt "$max" ] && max="$p"
  done
  echo $((max + 1))
}

alta() {
  local NOMBRE="$1"
  if ! [[ "$NOMBRE" =~ ^[a-z][a-z0-9]{1,29}$ ]]; then
    echo "✗ '$NOMBRE' no sirve: solo minúsculas y números, sin espacios ni tildes, empezando con letra."
    return 1
  fi
  local USUARIO="crm-$NOMBRE"
  local BASE="/srv/crm/$NOMBRE"
  local SITIO="$NOMBRE.$DOMINIO"

  if [ -d "$BASE" ]; then
    echo "• $NOMBRE ya estaba dado de alta (su ficha: /root/fichas/$NOMBRE.txt)."
    return 0
  fi
  echo "→ Alta de $NOMBRE ($SITIO)"

  # Usuario y carpetas: solo él puede leer sus archivos (sesión de WhatsApp, .env).
  useradd --system --home-dir "$BASE" --shell /bin/bash --user-group "$USUARIO"
  usermod -p "*" "$USUARIO"  # sin contraseña, pero no bloqueado (si no, SSH rechaza la llave)
  mkdir -p "$BASE/versiones" "$BASE/sesiones" "$BASE/.ssh"
  local PUERTO; PUERTO="$(siguiente_puerto)"
  echo "$PUERTO" > "$BASE/puerto"
  touch "$BASE/.env"
  chown -R "$USUARIO:$USUARIO" "$BASE"
  chmod 750 "$BASE"
  chmod 600 "$BASE/.env"

  # Llave de despliegue: solo puede ejecutar crm-desplegar con su nombre.
  mkdir -p /root/llaves
  ssh-keygen -q -t ed25519 -N "" -C "despliegue-$NOMBRE" -f "/root/llaves/$NOMBRE"
  echo "command=\"/usr/local/bin/crm-desplegar $NOMBRE\",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding $(cat "/root/llaves/$NOMBRE.pub")" > "$BASE/.ssh/authorized_keys"
  chown -R root:"$USUARIO" "$BASE/.ssh"
  chmod 750 "$BASE/.ssh"
  chmod 640 "$BASE/.ssh/authorized_keys"

  # Puede reiniciar y ver el registro de SU CRM, nada más.
  cat > "/etc/sudoers.d/$USUARIO" <<EOF
$USUARIO ALL=(root) NOPASSWD: /usr/bin/systemctl restart crm@$NOMBRE, /usr/bin/journalctl -u crm@$NOMBRE -n 40 --no-pager
EOF
  chmod 440 "/etc/sudoers.d/$USUARIO"
  visudo -cq -f "/etc/sudoers.d/$USUARIO"

  systemctl enable "crm@$NOMBRE" >/dev/null 2>&1

  # Sitio en nginx + SSL.
  cat > "/etc/nginx/sites-available/crm-$NOMBRE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SITIO;
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:$PUERTO;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
  ln -sfn "/etc/nginx/sites-available/crm-$NOMBRE" "/etc/nginx/sites-enabled/crm-$NOMBRE"
  nginx -t -q && systemctl reload nginx
  if certbot --nginx -d "$SITIO" --non-interactive --agree-tos --register-unsafely-without-email --redirect -q; then
    echo "  ✓ SSL listo"
  else
    echo "  ⚠ No se pudo sacar el SSL de $SITIO (¿el DNS ya apunta a $IP?). Reintentá con: certbot --nginx -d $SITIO --redirect"
  fi

  # Ficha para el estudiante.
  mkdir -p /root/fichas
  {
    echo "=============================================="
    echo " FICHA DE $NOMBRE"
    echo " Tu CRM: https://$SITIO"
    echo "=============================================="
    echo
    echo "Cargá estos 3 secretos en tu repo de GitHub:"
    echo "Settings → Secrets and variables → Actions → New repository secret"
    echo
    echo "--- Nombre: DEPLOY_HOST ---"
    echo "$IP"
    echo
    echo "--- Nombre: DEPLOY_USER ---"
    echo "$USUARIO"
    echo
    echo "--- Nombre: DEPLOY_KEY  (copiá TODO, incluidas las líneas BEGIN y END) ---"
    cat "/root/llaves/$NOMBRE"
  } > "/root/fichas/$NOMBRE.txt"
  chmod 600 "/root/fichas/$NOMBRE.txt"
  echo "  ✓ Ficha en /root/fichas/$NOMBRE.txt (puerto $PUERTO)"
}

[ "$#" -gt 0 ] || { echo "Uso: $0 nombre1 [nombre2 ...]"; exit 1; }
for n in "$@"; do alta "$n" || true; done
