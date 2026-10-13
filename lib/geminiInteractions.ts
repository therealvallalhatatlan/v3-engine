export type GeminiImageInput = {
  data: string;
  mimeType: string;
};

export type GeminiInteractionResult = {
  interactionId: string;
  imageBase64: string;
  responseText: string;
};

function normalizeMimeType(value: string): string {
  const mime = String(value || '').trim().toLowerCase();
  return mime.startsWith('image/') ? mime : 'image/png';
}

function inputToPart(input: GeminiImageInput) {
  const data = String(input.data || '').trim();
  if (!data) throw new Error('Image input data is empty');

  return {
    type: 'image',
    mime_type: normalizeMimeType(input.mimeType),
    data,
  };
}

function extractInteractionOutput(data: any): { imageBase64: string; responseText: string } {
  const imageCandidates: string[] = [];
  const textCandidates: string[] = [];

  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (const step of steps) {
    if (step?.type !== 'model_output') continue;
    const content = Array.isArray(step.content) ? step.content : [];
    for (const block of content) {
      if (block?.type === 'image' && typeof block?.data === 'string') {
        imageCandidates.push(block.data);
      }
      if (block?.type === 'text' && typeof block?.text === 'string') {
        textCandidates.push(block.text.trim());
      }
    }
  }

  if (!imageCandidates.length && data?.output_image?.data) {
    imageCandidates.push(String(data.output_image.data));
  }

  if (!textCandidates.length && data?.output_text) {
    textCandidates.push(String(data.output_text).trim());
  }

  const imageBase64 = imageCandidates[imageCandidates.length - 1] || '';
  const responseText = textCandidates[textCandidates.length - 1] || '';
  return { imageBase64, responseText };
}

async function callInteractionsApi(body: Record<string, unknown>): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    console.error('Gemini Interactions API error:', response.status, text);
    throw new Error(`Gemini Interactions API error: ${response.status} ${text}`);
  }

  return response.json();
}

export async function generateImageInteraction(options: {
  prompt: string;
  sourceImage?: GeminiImageInput;
  additionalImages?: GeminiImageInput[];
  /** Optional environment reference. This image is explicitly labeled as a compositional/background reference. */
  backgroundReferenceImage?: GeminiImageInput;
  /** Multiple environment references, each explicitly labeled to avoid confusing them with character references. */
  backgroundReferenceImages?: GeminiImageInput[];
  previousInteractionId?: string | null;
  aspectRatio?: '16:9' | '9:16';
  imageSize?: '0.5K' | '1K' | '2K' | '4K';
  systemInstruction?: string;
}): Promise<GeminiInteractionResult> {
  const aspectRatio = options.aspectRatio || '16:9';
  const imageSize = options.imageSize || '1K';

  const inputParts: Array<Record<string, string>> = [];
  if (options.sourceImage) inputParts.push(inputToPart(options.sourceImage));
  for (const image of options.additionalImages || []) {
    inputParts.push(inputToPart(image));
  }
  const environmentReferences = [
    ...(options.backgroundReferenceImage ? [options.backgroundReferenceImage] : []),
    ...(options.backgroundReferenceImages || []),
  ];
  environmentReferences.forEach((reference, index) => {
    inputParts.push({
      type: 'text',
      text: `[ENVIRONMENT REFERENCE IMAGE ${index + 1} OF ${environmentReferences.length}]\nUse this image only as environmental, architectural, compositional, material, or lighting guidance. Do not use it as a character identity reference and do not paste it as a literal background plate.`,
    });
    inputParts.push(inputToPart(reference));
  });

  inputParts.push({ type: 'text', text: options.prompt });

  const body: Record<string, unknown> = {
    model: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
    input: inputParts,
    store: true,
    response_format: [
      { type: 'text' },
      {
        type: 'image',
        mime_type: 'image/jpeg',
        aspect_ratio: aspectRatio,
        image_size: imageSize,
      },
    ],
  };

  if (options.previousInteractionId) {
    body.previous_interaction_id = options.previousInteractionId;
  }

  if (options.systemInstruction?.trim()) {
    body.system_instruction = options.systemInstruction.trim();
  }

  const data = await callInteractionsApi(body);
  if (data?.status && data.status !== 'completed') {
    throw new Error(`Gemini image interaction did not complete: ${data.status}`);
  }

  const parsed = extractInteractionOutput(data);
  if (!parsed.imageBase64) {
    throw new Error('Gemini Interactions API returned no image data');
  }

  return {
    interactionId: String(data?.id || ''),
    imageBase64: parsed.imageBase64,
    responseText: parsed.responseText || 'Elkészült.',
  };
}
