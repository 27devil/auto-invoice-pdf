/** Logo upload validation (spec §66, §32): never trust the file extension
 * or the browser-reported MIME type alone — check the actual file
 * signature (magic bytes). */

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

interface SignatureCheck {
  ext: string;
  mime: string;
  matches: (bytes: Uint8Array) => boolean;
}

const SIGNATURES: SignatureCheck[] = [
  { ext: "png", mime: "image/png", matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: "jpg", mime: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: "webp",
    mime: "image/webp",
    matches: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

export interface ValidatedImage {
  ext: string;
  mime: string;
}

export function validateLogoUpload(bytes: Uint8Array, declaredSize: number): ValidatedImage {
  if (declaredSize > MAX_LOGO_BYTES) {
    throw new Error("Logo must be 5MB or smaller.");
  }
  const match = SIGNATURES.find((sig) => sig.matches(bytes));
  if (!match) {
    throw new Error("Logo must be a PNG, JPG, or WEBP file.");
  }
  return { ext: match.ext, mime: match.mime };
}
