/**
 * Clipping Module Index
 *
 * 웹 클리핑 기능의 메인 진입점입니다.
 */

// Content Extraction
export { ContentExtractor, CONTENT_EXTRACTION_SCRIPT, SELECTION_EXTRACTION_SCRIPT } from './ContentExtractor'
export type { ExtractedContent } from './ContentExtractor'

// Metadata Parsing
export { MetadataParser, METADATA_EXTRACTION_SCRIPT } from './MetadataParser'
export type { PageMetadata } from './MetadataParser'

// Note Generation
export { NoteGenerator } from './NoteGenerator'
export type { NoteGeneratorOptions, GeneratedNote } from './NoteGenerator'

// Clip Service
export {
    ClipService,
    initializeClipService,
    getClipService,
    updateClipServiceSettings
} from './ClipService'
export type { ClipServiceOptions, ClipResult } from './ClipService'
