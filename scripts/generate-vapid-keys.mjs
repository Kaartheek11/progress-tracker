import { webcrypto } from "node:crypto";

const keyPair = await webcrypto.subtle.generateKey(
  {
    name: "ECDSA",
    namedCurve: "P-256"
  },
  true,
  ["sign", "verify"]
);

const publicKey = await webcrypto.subtle.exportKey("raw", keyPair.publicKey);
const privateJwk = await webcrypto.subtle.exportKey("jwk", keyPair.privateKey);

console.log("VITE_PUSH_REMINDER_PUBLIC_KEY / VAPID_PUBLIC_KEY:");
console.log(base64Url(publicKey));
console.log("");
console.log("VAPID_PRIVATE_JWK secret:");
console.log(JSON.stringify(privateJwk));
console.log("");
console.log("Keep the private JWK secret. The public key is safe to embed in the frontend.");

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
