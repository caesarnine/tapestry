"use client";

import { useState, useCallback, useEffect, useMemo } from 'react';
import { GridIcon, MenuIcon } from "lucide-react";
import ChatInterface from '@/components/ChatInterface';
import Sidebar from '@/components/Sidebar';
import DocumentPanel from '@/components/DocumentPanel';
import { fetchConversations, createConversation, deleteConversation, updateConversationTitle } from '@/lib/api';
import { CitationData } from '@/components/Citation';
import { fetchDocumentById } from '@/lib/api';
import { AuthForm } from '@/components/AuthForm';
import { DocumentStatus } from '@/components/DocumentAnalysisGrid';
import { UserSelections, Conversation } from '@/lib/types';
import { toast, Toaster } from 'react-hot-toast';

export default function Home() {
  const [selectedData, setSelectedData] = useState<UserSelections>({
    selectedTags: [],
    selectedDocuments: [],
    reasoningMode: false,
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null);
  const [isDocumentExpanded, setIsDocumentExpanded] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<CitationData | null>(null);
  const [documentCitations, setDocumentCitations] = useState<CitationData[]>([]);
  const [isDocumentLoading, setIsDocumentLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    setIsAuthenticated(!!token);
    setIsInitialized(false);

    const handleAuthError = () => {
      setIsAuthenticated(false);
      setIsInitialized(false);
    };

    window.addEventListener('auth_error', handleAuthError);
    return () => window.removeEventListener('auth_error', handleAuthError);
  }, []);

  const handleAuthSuccess = useCallback(() => {
    setIsAuthenticated(true);
    setIsInitialized(false);
  }, []);

  useEffect(() => {
    if (!isInitialized && isAuthenticated) {
      fetchConversations()
        .then(data => {
          setConversations(data);
          if (data.length > 0) {
            setSelectedConversationId(data[0].id);
          } else {
            return createConversation();
          }
        })
        .then(newConversation => {
          if (newConversation) {
            setConversations([newConversation]);
            setSelectedConversationId(newConversation.id);
          }
        })
        .catch(error => console.error('Error initializing chat:', error))
        .finally(() => setIsInitialized(true));
    }
  }, [isInitialized, isAuthenticated]);

  const handleDataSelection = useCallback((newData: UserSelections) => {
    setSelectedData(newData);
  }, []);

  const handleNewConversation = useCallback(async () => {
    try {
      const newConversation = await createConversation('New Conversation');
      setConversations(prev => [newConversation, ...prev]);
      setSelectedConversationId(newConversation.id);
    } catch (error) {
      console.error('Error creating new conversation:', error);
    }
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
  }, []);

  const handleNewMessage = useCallback((message: string) => {
    if (selectedConversationId) {
      setConversations(prev =>
        prev.map(conv =>
          conv.id === selectedConversationId
            ? { ...conv, title: message.slice(0, 30), updatedAt: new Date().toISOString() }
            : conv
        )
      );
      updateConversationTitle(selectedConversationId, message.slice(0, 30))
        .catch(error => console.error('Error updating conversation title:', error));
    }
  }, [selectedConversationId]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations(prev => prev.filter(conv => conv.id !== id));
      if (selectedConversationId === id) {
        setSelectedConversationId(null);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  }, [selectedConversationId]);

  const handleConversationCreated = useCallback((newConversation: Conversation) => {
    setConversations(prev => [newConversation, ...prev]);
    setSelectedConversationId(newConversation.id);
  }, []);

  const handleCitationClick = useCallback(async (citation: CitationData, allDocumentCitations: CitationData[]) => {
    setIsDocumentLoading(true);
    try {
      const document = await fetchDocumentById(citation.document_id);
      setSelectedDocument(document);
      setSelectedCitation(citation);
      setDocumentCitations(allDocumentCitations);
    } catch (error) {
      console.error('Error fetching transcript:', error);
    } finally {
      setIsDocumentLoading(false);
    }
  }, []);

  const handleDocumentClick = useCallback(async (document: DocumentStatus) => {
    if (document.document_id) {
      setIsDocumentLoading(true);
      try {
        const fetchedDocument = await fetchDocumentById(document.document_id);
        setSelectedDocument(fetchedDocument);
        setSelectedCitation(null);
        setDocumentCitations([]);
      } catch (error) {
        console.error('Error fetching document:', error);
      } finally {
        setIsDocumentLoading(false);
      }
    } else {
      console.error('Document document_id is undefined');
    }
  }, []);

  const handleToggleDocumentExpand = useCallback(() => {
    setIsDocumentExpanded(prev => !prev);
    setIsSidebarOpen(prev => isDocumentExpanded ? true : !prev);
  }, [isDocumentExpanded]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
    if (isDocumentExpanded) {
      setIsDocumentExpanded(false);
    }
  }, [isDocumentExpanded]);

  const sidebarProps = useMemo(() => ({
    onDataSelectionChange: handleDataSelection,
    conversations,
    onSelectConversation: handleSelectConversation,
    onNewConversation: handleNewConversation,
    onDeleteConversation: handleDeleteConversation,
    selectedConversationId,
  }), [handleDataSelection, conversations, handleSelectConversation, handleNewConversation, handleDeleteConversation, selectedConversationId]);

  const chatInterfaceProps = useMemo(() => ({
    selectedData,
    conversationId: selectedConversationId,
    onNewMessage: handleNewMessage,
    onConversationCreated: handleConversationCreated,
    onCitationClick: handleCitationClick,
    onDocumentClick: handleDocumentClick,
  }), [selectedData, selectedConversationId, handleNewMessage, handleConversationCreated, handleCitationClick, handleDocumentClick]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-96">
          <h1 className="text-2xl font-bold mb-4">Welcome to Tapestry</h1>
          <AuthForm onAuthSuccess={handleAuthSuccess} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-screen bg-gray-100">
        <header className="bg-gradient-to-r from-blue-400 to-purple-500 shadow-sm z-10">
          <div className="flex items-center h-14 px-4">
            <button
              onClick={handleToggleSidebar}
              className="text-white hover:text-gray-200 focus:outline-none mr-3"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <div className="flex items-center space-x-2">
              <GridIcon className="h-6 w-6 text-white" />
              <h1 className="text-xl font-semibold text-white">Tapestry</h1>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
          <aside
            className={`bg-white w-80 flex-shrink-0 border-r border-gray-200 transition-all duration-300 ease-in-out overflow-hidden ${
              isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="h-full">
              <Sidebar {...sidebarProps} />
            </div>
          </aside>

          <main className={`flex-1 overflow-hidden transition-all duration-300 ease-in-out ${
            isSidebarOpen ? 'ml-0' : 'ml-0 lg:ml-[-320px]'
          }`}>
            <div className="h-full p-4 relative flex transition-all duration-300 ease-in-out">
              <div className={`transition-all duration-300 ease-in-out ${
                selectedDocument 
                  ? (isDocumentExpanded ? 'w-1/2' : isSidebarOpen ? 'w-[calc(100%-32rem)]' : 'w-1/2') 
                  : 'w-full'
              } flex justify-center`}>
                <div className="w-full max-w-4xl">
                  {isInitialized && <ChatInterface {...chatInterfaceProps} />}
                </div>
              </div>
              {selectedDocument && (
                <div className={`fixed top-14 bottom-0 right-0 bg-white shadow-lg border-l border-gray-200 transition-all duration-300 ease-in-out ${
                  isDocumentExpanded ? 'w-1/2' : (isSidebarOpen ? 'w-[32rem]' : 'w-1/2')
                }`}>
                  <DocumentPanel
                    document={selectedDocument}
                    onClose={() => {
                      setSelectedDocument(null);
                      setSelectedCitation(null);
                      setDocumentCitations([]);
                    }}
                    isExpanded={isDocumentExpanded}
                    onToggleExpand={handleToggleDocumentExpand}
                    selectedCitation={selectedCitation}
                    documentCitations={documentCitations}
                    isLoading={isDocumentLoading}
                  />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      <Toaster />
    </>
  );
}
