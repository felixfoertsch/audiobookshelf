import { createFileRoute } from '@tanstack/react-router'
import { UploadPage } from '../features/upload'
export const Route = createFileRoute('/upload')({ component: UploadPage })
