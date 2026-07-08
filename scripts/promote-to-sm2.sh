#!/usr/bin/env bash
#
# promote-to-sm2.sh — parte DETERMINISTA del flujo de promoción de issues.
#
# AQ2 es un filtro/staging: los bugs aprobados (label `sm2`, abiertos) se suben a
# mediastream/sm2 y el issue de AQ2 se CIERRA con cross-link. El estado cerrado es
# la marca de "ya promovido" (idempotencia sin label extra). Ver la memoria del
# proyecto: issue-promotion-aq2-to-sm2.
#
# Este script NO reescribe el contenido a lenguaje de producto: eso es criterio y
# lo hace el skill /promote-issues, que pasa el body ya reencuadrado con --body.
#
# Uso:
#   scripts/promote-to-sm2.sh --list
#       Lista los candidatos (issues ABIERTOS de AQ2 con label `sm2`).
#
#   scripts/promote-to-sm2.sh --promote <aq2#> --body <archivo.md> [opciones]
#       Crea el issue en SM2 con ese body, cierra el de AQ2 con el link cruzado, y
#       muestra dónde repuntar las referencias `test.fail` al número de SM2.
#       Opciones:
#         --title "<t>"      Título en SM2 (default: el título del issue de AQ2).
#         --sm2-label <l>    Label a poner en el issue de SM2 (repetible).
#         --dry-run          Muestra lo que haría, sin crear ni cerrar nada.
#
# Repos: AQ2_REPO (default Jurrego1771/AQ2), SM2 desde $SM2_GITHUB_REPO / .env
# (default mediastream/sm2). Requiere `gh` autenticado y `jq`.

set -euo pipefail

AQ2_REPO="${AQ2_REPO:-Jurrego1771/AQ2}"

# Resuelve el repo SM2: variable de entorno -> .env -> default.
SM2_REPO="${SM2_GITHUB_REPO:-}"
if [ -z "$SM2_REPO" ] && [ -f .env ]; then
  SM2_REPO="$(grep -E '^SM2_GITHUB_REPO=' .env | head -1 | cut -d= -f2- | tr -d '"'\'' \r' || true)"
fi
SM2_REPO="${SM2_REPO:-mediastream/sm2}"

die() { echo "error: $*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "falta '$1' en el PATH"; }
need gh
need jq

# ---------------------------------------------------------------------------
list_candidates() {
  echo "Candidatos a promover (abiertos con label 'sm2' en $AQ2_REPO):"
  local out
  out="$(gh issue list --repo "$AQ2_REPO" --state open --label sm2 \
          --json number,title -q '.[] | "  #\(.number)\t\(.title)"')"
  if [ -z "$out" ]; then
    echo "  (ninguno)"
  else
    echo "$out"
  fi
}

# ---------------------------------------------------------------------------
promote() {
  local num="$1" body_file="$2" title="$3" dry="$4"; shift 4
  local labels=("$@")

  [ -n "$num" ] || die "--promote requiere el número del issue de AQ2"
  [ -n "$body_file" ] || die "--promote requiere --body <archivo.md>"
  [ -f "$body_file" ] || die "no existe el archivo de body: $body_file"

  # Guardas de idempotencia y aprobación.
  local meta state has_sm2 aq2_title
  meta="$(gh issue view "$num" --repo "$AQ2_REPO" --json state,title,labels)"
  state="$(echo "$meta" | jq -r '.state')"
  aq2_title="$(echo "$meta" | jq -r '.title')"
  has_sm2="$(echo "$meta" | jq -r '[.labels[].name] | index("sm2") // "no"')"

  [ "$state" = "OPEN" ] || die "AQ2#$num está $state — un issue no-abierto no es candidato (¿ya promovido?)."
  [ "$has_sm2" != "no" ] || die "AQ2#$num no tiene label 'sm2' — no aprobado para promover."

  [ -n "$title" ] || title="$aq2_title"

  # Compone el body de SM2: contenido reencuadrado + footer de traza a AQ2.
  local tmp; tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN
  cat "$body_file" > "$tmp"
  {
    echo
    echo "---"
    echo "_Reportado vía QA exploratorio (AQ2). Origen: ${AQ2_REPO}#${num}._"
  } >> "$tmp"

  # Argumentos de label para gh (0..n).
  local label_args=()
  local l; for l in "${labels[@]:-}"; do [ -n "$l" ] && label_args+=(--label "$l"); done

  local close_comment
  if [ "$dry" = "1" ]; then
    echo "== DRY-RUN — no se crea ni se cierra nada =="
    echo "SM2 destino : $SM2_REPO"
    echo "Título      : $title"
    [ "${#label_args[@]}" -gt 0 ] && echo "Labels SM2  : ${labels[*]}"
    echo "AQ2 a cerrar: $AQ2_REPO#$num ($aq2_title)"
    echo "--- body que se enviaría a SM2 ---"
    cat "$tmp"
    echo "--- fin body ---"
    echo
    show_repoint_targets "$num" "<sm2#>"
    return 0
  fi

  # Crea en SM2 y captura la URL.
  local url sm2num
  url="$(gh issue create --repo "$SM2_REPO" --title "$title" --body-file "$tmp" "${label_args[@]}")"
  sm2num="$(echo "$url" | grep -oE '[0-9]+$')"
  [ -n "$sm2num" ] || die "no pude extraer el número de SM2 de la URL: $url"
  echo "creado: $url"

  # Cierra el issue de AQ2 con el link cruzado.
  close_comment="Promovido a ${SM2_REPO}#${sm2num} — seguimiento del fix allá: ${url}"
  gh issue close "$num" --repo "$AQ2_REPO" --comment "$close_comment" >/dev/null
  echo "cerrado: $AQ2_REPO#$num (comentario con link a SM2)"
  echo
  show_repoint_targets "$num" "$SM2_REPO#$sm2num"
}

# Imprime dónde hay que repuntar las referencias del `test.fail` / knowledge-core.
show_repoint_targets() {
  local num="$1" newref="$2"
  echo "REPUNTAR estas referencias a ${newref} (lo hace el skill/editas a mano):"
  local hits
  hits="$(grep -rn -E "AQ2/issues/${num}\b|#${num}\b" tests knowledge-core 2>/dev/null || true)"
  if [ -z "$hits" ]; then
    echo "  (no se hallaron referencias a #$num en tests/ ni knowledge-core/)"
  else
    echo "$hits" | sed 's/^/  /'
  fi
}

# ---------------------------------------------------------------------------
# Parser de argumentos.
CMD=""
AQ2_NUM=""
BODY_FILE=""
TITLE=""
DRY="0"
LABELS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --list)      CMD="list" ;;
    --promote)   CMD="promote"; AQ2_NUM="${2:-}"; shift ;;
    --body)      BODY_FILE="${2:-}"; shift ;;
    --title)     TITLE="${2:-}"; shift ;;
    --sm2-label) LABELS+=("${2:-}"); shift ;;
    --dry-run)   DRY="1" ;;
    -h|--help)   sed -n '2,40p' "$0"; exit 0 ;;
    *)           die "argumento desconocido: $1 (usa --help)" ;;
  esac
  shift
done

case "$CMD" in
  list)    list_candidates ;;
  promote) promote "$AQ2_NUM" "$BODY_FILE" "$TITLE" "$DRY" "${LABELS[@]:-}" ;;
  *)       sed -n '2,40p' "$0"; exit 1 ;;
esac
