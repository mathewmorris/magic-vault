/**
 * The models behind AI card recognition, and how their inputs are laid out.
 *
 * Both are MIT licensed and come from Hugging Face:
 *  - Corner detector: https://huggingface.co/dhvazquez/mtg_card_pose_estimation
 *    (DETRPose-S, 640x640 RGB in [0, 1], outputs the card's 4 corners).
 *  - Card embedder: https://huggingface.co/dhvazquez/mtg_card_identification_embeddings
 *    (EfficientNet-Lite0 + SubCenterArcFace, 448x320 HxW full card crop,
 *    256-d L2-normalized embedding, 94.1% Recall@1 on its validation set).
 *
 * The browser embeds the photo and the indexer (scripts/embed-cards.ts)
 * embeds Scryfall's images with the SAME spec and the same preprocessing code
 * (./preprocess.ts), so query and gallery vectors are comparable.
 *
 * The model cards don't state the embedder's normalization. ImageNet mean/std
 * is the default for a pretrained EfficientNet-Lite0; `npm run embed:calibrate`
 * measures the alternatives on real Scryfall images. Changing anything here
 * that changes the vectors MUST bump EMBED_MODEL.id, which makes the indexer
 * build a fresh set of embeddings (old ones are keyed by the old id).
 */

export type Normalization = {
  /** Per-channel mean and std applied after scaling pixels to [0, 1]. */
  mean: [number, number, number];
  std: [number, number, number];
};

export type EmbedModelSpec = {
  /** Stored next to each embedding. Bump when the vectors would change. */
  id: string;
  url: string;
  inputWidth: number;
  inputHeight: number;
  dims: number;
  layout: "NCHW" | "NHWC";
} & Normalization;

export const NORMALIZATIONS = {
  imagenet: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
  half: { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] },
  unit: { mean: [0, 0, 0], std: [1, 1, 1] },
} satisfies Record<string, Normalization>;

const HF = "https://huggingface.co";

export const EMBED_MODEL: EmbedModelSpec = {
  id: "dhvazquez-mtg-embed-20260521-int8-imagenet",
  url:
    process.env.NEXT_PUBLIC_SCAN_EMBED_MODEL_URL ??
    `${HF}/dhvazquez/mtg_card_identification_embeddings/resolve/main/20260521-044732/onnx/mtg_embed_int8.onnx`,
  inputWidth: 320,
  inputHeight: 448,
  dims: 256,
  layout: "NCHW",
  ...NORMALIZATIONS.imagenet,
};

export type PoseModelSpec = {
  url: string;
  inputSize: number;
};

/** Leave NEXT_PUBLIC_SCAN_POSE_MODEL_URL blank ("") to skip the corner model and use OpenCV only. */
export const POSE_MODEL: PoseModelSpec | null = (() => {
  const configured = process.env.NEXT_PUBLIC_SCAN_POSE_MODEL_URL;
  if (configured === "") return null;
  return {
    url:
      configured ??
      `${HF}/dhvazquez/mtg_card_pose_estimation/resolve/main/exports/mtg_4kp_s_r4b_fp16.onnx`,
    inputSize: 640,
  };
})();

/**
 * A flattened card, the size every crop is warped to before embedding and
 * OCR. Same proportions as Scryfall's "normal" image (488x680), which is
 * also what the indexer downloads.
 */
export const CARD_WIDTH = 488;
export const CARD_HEIGHT = 680;
