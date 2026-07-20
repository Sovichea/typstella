# Primary and embedded scripts

Purpose: distinguish document typography from language tools.

Prerequisites: install the named MiSans families or choose locally available
Latin, Khmer, and Arabic fonts from Typsastra's typography control.

Expected behavior: the ordered fallback renders all three scripts, while each
explicit `lang` scope retains its own spellcheck-provider ownership. Changing a
font role must not change spellcheck or completion language.

Tutorial: <https://github.com/Sovichea/typsastra/blob/main/docs/tutorials/DOCUMENT_TYPOGRAPHY.md>
