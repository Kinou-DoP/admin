// Fournisseur d'accès Amazon pour l'outil aws (credential_process), utilisé par tools/copie-slate.mjs sur GitHub Actions.
// L'accès obtenu par OIDC ne dure qu'une heure (durée maximale du rôle kinou-robot-copie) ; l'outil aws rappelle ce script
// quand l'accès approche de sa fin, y compris au milieu d'un long envoi : GitHub fournit un nouveau jeton OIDC, échangé
// contre un nouvel accès temporaire. Aucune clé stockée. N'écrit rien dans les journaux (la sortie est lue par aws).
import { spawnSync } from "node:child_process";

const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, jeton = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const ROLE = process.env.AWS_ROLE_COPIE;
if (!url || !jeton || !ROLE) { console.error("aws-cle : pas sur GitHub Actions (OIDC) ou rôle absent"); process.exit(1); }
const r = await fetch(url + "&audience=sts.amazonaws.com", { headers: { Authorization: "bearer " + jeton } });
if (!r.ok) { console.error("aws-cle : jeton OIDC refusé (" + r.status + ")"); process.exit(1); }
const oidc = (await r.json()).value;
// Appel non signé (AssumeRoleWithWebIdentity) : environnement sans profil ni accès, pour ne pas se rappeler soi-même.
const env = Object.assign({}, process.env);
["AWS_PROFILE", "AWS_CONFIG_FILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"].forEach((k) => delete env[k]);
const p = spawnSync("aws", ["sts", "assume-role-with-web-identity", "--role-arn", ROLE, "--role-session-name", "copie-slate",
  "--web-identity-token", oidc, "--duration-seconds", "3600", "--output", "json"], { env, encoding: "utf8" });
if (p.status !== 0) { console.error("aws-cle : accès Amazon refusé"); process.exit(1); }
const c = JSON.parse(p.stdout).Credentials;
process.stdout.write(JSON.stringify({ Version: 1, AccessKeyId: c.AccessKeyId, SecretAccessKey: c.SecretAccessKey,
  SessionToken: c.SessionToken, Expiration: c.Expiration }));
