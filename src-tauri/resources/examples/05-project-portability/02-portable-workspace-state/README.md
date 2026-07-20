# Portable workspace state

Purpose: verify that project-relative settings survive moving the whole folder.

Do not manually copy `.typsastra/cache`; it is generated and disposable. The
application owns `.typsastra/config.json` and `.typsastra/workspace.json` and
writes them atomically as state changes.

Tutorial: <https://github.com/Sovichea/typsastra/blob/main/docs/tutorials/PROJECTS_AND_MAIN_FILES.md>
