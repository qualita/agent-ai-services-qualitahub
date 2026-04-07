import { webcrypto } from 'crypto'
// @azure/storage-blob requires globalThis.crypto (Web Crypto API) which is not
// automatically global in Node.js 18 — polyfill it before loading the SDK.
if (!globalThis.crypto) {
  ;(globalThis as unknown as Record<string, unknown>).crypto = webcrypto
}

import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob'

const account = process.env.AZURE_STORAGE_ACCOUNT || ''
const key = process.env.AZURE_STORAGE_KEY || ''
const container = process.env.AZURE_STORAGE_CONTAINER || 'agent-files'

let _client: BlobServiceClient | null = null

function getClient(): BlobServiceClient {
  if (!_client) {
    const credential = new StorageSharedKeyCredential(account, key)
    _client = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential)
  }
  return _client
}

/**
 * Generate a short-lived SAS URL (read-only, 1 hour) for a blob.
 */
export function getBlobSasUrl(blobPath: string, downloadName?: string, inline?: boolean): string {
  const credential = new StorageSharedKeyCredential(account, key)
  const expiresOn = new Date()
  expiresOn.setHours(expiresOn.getHours() + 1)

  let contentDisposition: string
  if (inline) {
    contentDisposition = 'inline'
  } else {
    contentDisposition = downloadName
      ? `attachment; filename="${downloadName}"`
      : 'attachment'
  }

  const sas = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
      contentDisposition,
    },
    credential
  ).toString()

  return `https://${account}.blob.core.windows.net/${container}/${blobPath}?${sas}`
}

/**
 * Download blob content as a Buffer.
 */
export async function downloadBlob(blobPath: string): Promise<Buffer> {
  const client = getClient()
  const containerClient = client.getContainerClient(container)
  const blobClient = containerClient.getBlobClient(blobPath)
  const response = await blobClient.download()
  const chunks: Buffer[] = []
  for await (const chunk of response.readableStreamBody!) {
    chunks.push(Buffer.from(chunk as ArrayBuffer))
  }
  return Buffer.concat(chunks)
}

/**
 * Upload a Buffer as a blob with the given content type.
 */
export async function uploadBlob(blobPath: string, content: Buffer, contentType: string): Promise<void> {
  const client = getClient()
  const containerClient = client.getContainerClient(container)
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath)
  await blockBlobClient.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  })
}
