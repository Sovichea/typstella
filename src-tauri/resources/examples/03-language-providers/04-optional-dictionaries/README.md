# Optional dictionaries

Purpose: test provider installation, removal, and unavailable-scope recovery.

Expected behavior before installation: the relevant `lang` declarations show a
hint and gutter warning, while those scopes receive no spellcheck results.

Expected behavior after installation and enablement: the warning disappears and
the matching provider checks only its own explicit scope. Same-script languages
such as English, French, and Spanish must not substitute for one another.

Tutorial: <https://github.com/Sovichea/typsastra/blob/main/docs/tutorials/LANGUAGE_PROVIDER_INSTALLATION.md>
