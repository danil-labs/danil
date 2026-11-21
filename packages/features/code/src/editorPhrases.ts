import { t } from "../../../../apps/desktop/src/lib/i18n";

/**
 * Las frases que CodeMirror pinta o anuncia. La clave es su identificador en
 * inglés, no texto de pantalla; `$` es el número que él inserta.
 */
export const frasesDelEditor = () => ({
  Find: t("code.editor.find"),
  Replace: t("code.editor.replace_field"),
  next: t("code.editor.next"),
  previous: t("code.editor.previous"),
  all: t("code.editor.all"),
  "match case": t("code.editor.match_case"),
  regexp: t("code.editor.regexp"),
  "by word": t("code.editor.by_word"),
  replace: t("code.editor.replace"),
  "replace all": t("code.editor.replace_all"),
  close: t("code.editor.close"),
  "current match": t("code.editor.current_match"),
  "on line": t("code.editor.on_line"),
  "replaced $ matches": t("code.editor.replaced_matches"),
  "replaced match on line $": t("code.editor.replaced_on_line"),
  "Go to line": t("code.editor.go_to_line"),
  go: t("code.editor.go"),
  "Control character": t("code.editor.control_character"),
  "Selection deleted": t("code.editor.selection_deleted"),
  "Fold line": t("code.editor.fold_line"),
  "Unfold line": t("code.editor.unfold_line"),
  "folded code": t("code.editor.folded_code"),
  unfold: t("code.editor.unfold"),
  "Folded lines": t("code.editor.folded_lines"),
  "Unfolded lines": t("code.editor.unfolded_lines"),
});
