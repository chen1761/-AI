const LICENSE_PUBLIC_KEY = {
  kty: "EC",
  x: "5sn6jwi-cIDJ_315K8xpgUZjW_IlYZDZxgpbHYLYLp4",
  y: "_bbHMjvLykybU4evoG9N9Yu6-bzEgBGgZniC7Ls_9tI",
  crv: "P-256"
};

function b64urlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}

async function verifyLicenseKey(key, expectedPlanId) {
  const cleaned = String(key || "").trim().replace(/\s+/g, "");
  const parts = cleaned.split(".");
  if (parts.length !== 3 || parts[0] !== "FTA") {
    throw new Error("秘钥格式不正确");
  }

  let payload;
  try {
    const payloadText = bytesToText(b64urlToBytes(parts[1]));
    payload = JSON.parse(payloadText);
  } catch {
    throw new Error("秘钥内容无法识别，请确认是否完整复制");
  }
  if (payload.planId !== expectedPlanId) {
    throw new Error("秘钥版本不匹配");
  }
  if (!payload.licenseId || !payload.validDays || !payload.maxGenerations) {
    throw new Error("秘钥缺少必要授权信息");
  }
  if (payload.expiresAt && Date.now() > payload.expiresAt) {
    throw new Error("秘钥已过期，请联系服务方重新生成");
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    LICENSE_PUBLIC_KEY,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );

  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[1])
  );

  if (!ok) {
    throw new Error("秘钥签名无效");
  }

  return payload;
}
