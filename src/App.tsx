import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { DocumentEditorPage } from '@/pages/DocumentEditorPage'
import { DynamicModulePage } from '@/pages/DynamicModulePage'
import { ModuleSettingsPage } from '@/pages/ModuleSettingsPage'
import { AppsPage } from '@/pages/AppsPage'
import { ProductPage } from '@/pages/ProductPage'
import { QAPage } from '@/pages/QAPage'
import { CreatePrototypePage } from '@/pages/CreatePrototypePage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/product" element={<ProductPage />} />
        <Route path="/qa/:sessionId?" element={<QAPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/documents/folder/:folderId" element={<DocumentsPage />} />
        <Route path="/documents/new" element={<DocumentEditorPage />} />
        <Route path="/documents/:id/edit" element={<DocumentEditorPage />} />

        <Route path="/ai-assistant" element={<Navigate to="/modules/ai-assistant" replace />} />
        <Route path="/help-center" element={<Navigate to="/modules/help-center" replace />} />

        <Route path="/modules/create-prototype" element={<CreatePrototypePage />} />
        <Route path="/modules/:id" element={<DynamicModulePage />} />
        <Route path="/modules/:id/settings" element={<ModuleSettingsPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
