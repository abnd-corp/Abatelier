## Ce qui change

<!-- En deux ou trois phrases : quoi, et pourquoi. -->

## Checklist « élément terminé »

**Tests**
- [ ] Les routes API ajoutées ou modifiées sont testées dans `api/test/` : cas normal, erreurs et droits d'accès.
- [ ] Les composants Vue ajoutés ou modifiés sont testés dans `web/test/`.
- [ ] Le parcours utilisateur est couvert par Playwright dans `e2e/tests/`, sur Chromium et Firefox.

**Sécurité**
- [ ] Chaque nouvelle route exige une session (`requireAuth`) ou une permission (`requirePerm`). Sinon, elle est ajoutée volontairement à la liste `PUBLIC` de `api/test/security.test.ts`, avec une explication.
- [ ] Les entrées sont validées avec zod, et les erreurs sont renvoyées en français, sans détail technique.
- [ ] Les actions importantes sont notées dans le journal (`audit(req, '…')`), et leur libellé est ajouté dans `web/src/lib/audit-labels.ts`.
- [ ] Aucune donnée sensible n'est renvoyée au front ou écrite dans les logs (hash, jeton, mot de passe).
- [ ] Aucune information sur l'entreprise ni aucun secret n'est commité : ils vont dans `entreprise/` ou `secrets/`.

**Base de données**
- [ ] Si le schéma change, la migration est générée (`npm run db:generate`) et commitée.
