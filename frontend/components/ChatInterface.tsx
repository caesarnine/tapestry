"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SendIcon, Bot, Loader2, LightbulbIcon } from "lucide-react";
import Markdown from 'markdown-to-jsx';
import DocumentAnalysisGrid from './DocumentAnalysisGrid';
import { getWebSocketUrl, createConversation, Conversation} from '@/lib/api';
import { CitationReference, CitationProvider, CitationData } from './Citation';
import { Header } from './ResponseSections';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import debounce from 'lodash/debounce';
import { DocumentStatus } from './DocumentAnalysisGrid';
import { UserSelections, Document } from '@/lib/types';
import { motion } from 'framer-motion';

interface Message {
  role: "user" | "assistant" | "document_analysis";
  content: string | {
    status: string;
    total_documents?: number;
    completed_documents?: number;
    document_data?: DocumentStatus[];
  };
}

interface ChatInterfaceProps {
  selectedData: UserSelections;
  conversationId: string | null;
  onNewMessage: (message: string) => void;
  onConversationCreated: (conversation: Conversation) => void;
  onCitationClick: (citation: CitationData, allDocumentCitations: CitationData[]) => void;
  onDocumentClick: (document: DocumentStatus) => void;
}

// Add this near the top of the file
enum DocumentAnalysisStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETE = "complete",
  ERROR = "error"
}

// Add this type definition at the top of the file
type DocumentAnalysisMessage = {
  status: string;
  total_documents: number;
  completed_documents: number;
  document_data: DocumentStatus[];
};

export default function ChatInterface({ selectedData, conversationId, onNewMessage, onConversationCreated, onCitationClick, onDocumentClick }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<DocumentStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [reasoningMode, setReasoningMode] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState('auto');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hiddenDivRef = useRef<HTMLDivElement>(null);
  const [citations, setCitations] = useState<Record<string, CitationData>>({});
  const allCitationsRef = useRef<Record<string, CitationData[]>>({});
  const [citationKey, setCitationKey] = useState(0);
  const [documentStatuses, setDocumentStatuses] = useState<DocumentStatus[]>([]);
  const [documentAnalysisResults, setDocumentAnalysisResults] = useState<DocumentAnalysisMessage[]>([]);

  const { sendMessage, lastMessage, readyState } = useWebSocket(
    getWebSocketUrl(conversationId),
    {
      shouldReconnect: (closeEvent) => true,
      reconnectAttempts: 10,
      reconnectInterval: 3000,
      onError: (event) => {
        console.error('WebSocket error:', event);
        if (event instanceof CloseEvent && event.code === 1008) {
          // Authentication error
          localStorage.removeItem('access_token');
          window.dispatchEvent(new Event('auth_error'));
        }
      },
    }
  );

  useEffect(() => {
    if (!conversationId) {
      createNewConversation();
    }
  }, []);

  const createNewConversation = async () => {
    try {
      const newConversation = await createConversation();
      onConversationCreated(newConversation);
    } catch (error) {
      console.error("Error creating new conversation:", error);
    }
  };

  useEffect(() => {
    if (conversationId) {
      // Reset messages and current assistant message
      setMessages([]);
      setCurrentAssistantMessage('');
      
      // Reset citations
      setCitations({});
      
      // Increment the citation key to reset the CitationProvider
      setCitationKey(prevKey => prevKey + 1);
    }
  }, [conversationId]);

  useEffect(() => {
    if (lastMessage !== null) {
      try {
        const parsedMessage = JSON.parse(lastMessage.data);
        handleParsedMessage(parsedMessage);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    }
  }, [lastMessage]);

  const handleParsedMessage = (parsedMessage: any) => {
    switch (parsedMessage.type) {
      case "conversation_history":
        const processedMessages = parsedMessage.content.map((msg: any) => {
          if (msg.role === "document_analysis") {
            const content = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
            return {
              role: msg.role,
              content: {
                status: content.status,
                total_documents: content.total_documents || 0,
                completed_documents: content.completed_documents || 0,
                document_data: content.documents?.map((doc: any) => ({
                  id: doc.document_id,
                  document_date: doc.document_date,
                  status: doc.status as DocumentAnalysisStatus,
                  document_id: doc.document_id,
                  document_filename: doc.document_filename
                })) || []
              }
            };
          }
          return {
            role: msg.role,
            content: msg.role === "document_analysis" ? JSON.stringify(msg.content) : msg.content[0].text
          };
        });

        setMessages(processedMessages);
        
        const documentAnalysisMessages = processedMessages
          .filter((msg: Message) => msg.role === "document_analysis")
          .map((msg: Message) => msg.content as DocumentAnalysisMessage);
        
        setDocumentAnalysisResults(documentAnalysisMessages);
        
        // Process citations from conversation history
        const historyCitations = parsedMessage.content.reduce((acc: Record<string, CitationData>, msg: any) => {
          if (msg.role === "document_analysis" && msg.content.citations) {
            msg.content.citations.forEach((citation: CitationData) => {
              acc[citation.id] = citation;
            });
          }
          return acc;
        }, {});
        setCitations(historyCitations);
        break;
      case "assistant_message":
        setCurrentAssistantMessage(prev => prev + parsedMessage.content);
        break;
      case "tool_call_start":
        if (parsedMessage.tool_name === "analyze_documents") {
          setMessages(prev => [
            ...prev,
            { role: "assistant", content: currentAssistantMessage },
            {
              role: "document_analysis",
              content: {
                status: "start",
                total_documents: 0,
                completed_documents: 0,
                document_data: []
              }
            }
          ]);
          setCurrentAssistantMessage('');
        }
        break;
      case "document_analysis":
        handleDocumentAnalysis(parsedMessage);
        break;
      case "tool_call_end":
        setCurrentAssistantMessage('');
        break;
      case "end_of_response":
        setIsStreaming(false);
        finalizeMessages();
        break;
      case "citations":
        const newCitations = parsedMessage.citations.reduce((acc: Record<string, CitationData>, quote: CitationData) => {
          acc[quote.id] = quote;
          return acc;
        }, {});
        setCitations(newCitations);
        break;
      default:
        console.warn("Unknown message type:", parsedMessage.type);
    }
  };

  const handleDocumentAnalysis = (analysisMessage: any) => {
    if (analysisMessage.status === "start") {
      setDocumentStatuses(analysisMessage.documents.map((doc: any) => ({
        id: doc.document_id,
        document_date: doc.document_date,
        status: doc.status as DocumentAnalysisStatus,
        document_id: doc.document_id,
        document_filename: doc.document_filename
      })));
    } else {
      setDocumentStatuses(prev => {
        const updatedStatuses = [...prev];
        const index = updatedStatuses.findIndex(doc => doc.id === analysisMessage.document_id);
        if (index !== -1) {
          updatedStatuses[index] = {
            ...updatedStatuses[index],
            status: analysisMessage.status as DocumentAnalysisStatus,
            document_date: analysisMessage.document_date,
            document_filename: analysisMessage.document_filename
          };
        }
        return updatedStatuses;
      });
    }

    // Update messages for backward compatibility
    setMessages(prev => {
      const lastIndex = prev.length - 1;
      const lastMessage = prev[lastIndex];

      if (lastMessage.role !== "document_analysis") {
        return [...prev, {
          role: "document_analysis",
          content: {
            status: "in_progress",
            total_documents: analysisMessage.total_documents || documentStatuses.length,
            completed_documents: documentStatuses.filter(doc => doc.status === DocumentAnalysisStatus.COMPLETE).length,
            document_data: documentStatuses
          }
        }];
      }

      const updatedMessage = { ...lastMessage };
      const content = typeof updatedMessage.content === 'string' 
        ? { status: 'in_progress' } 
        : { ...updatedMessage.content };

      content.completed_documents = documentStatuses.filter(doc => doc.status === DocumentAnalysisStatus.COMPLETE).length;
      content.document_data = documentStatuses;

      return [...prev.slice(0, lastIndex), { ...updatedMessage, content }];
    });
  };

  const finalizeMessages = () => {
    if (currentAssistantMessage) {
      setMessages(prev => [...prev, { role: 'assistant', content: currentAssistantMessage }]);
      setCurrentAssistantMessage('');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentAssistantMessage]);

  const handleSendMessage = () => {
    if (inputMessage.trim() !== '' && readyState === ReadyState.OPEN) {
      const newMessage: Message = { role: 'user', content: inputMessage };
      setMessages(prev => [...prev, newMessage]);
      
      onNewMessage(inputMessage);
      
      const messageData = JSON.stringify({
        message: inputMessage,
        context: {
          ...selectedData,
          reasoningMode,
        }
      });
      
      sendMessage(messageData);
      setInputMessage('');
      setIsStreaming(true);
    }
  };

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Open',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Closed',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  const handleDocumentClick = (document: DocumentStatus) => {
    console.log('Document clicked:', document);
    setSelectedDocument(document);
  };

  const customMarkdownOptions = {
    overrides: {
      h4: {
        component: Header,
      },
      citation: {
        component: ({ id }: { id: string }) => (
          <CitationReference 
            id={id} 
            onClick={() => {
              const citation = citations[id];
              if (citation) {
                const documentCitations = allCitationsRef.current[citation.document_id] || [];
                onCitationClick(citation, documentCitations);
              }
            }} 
          />
        ),
      },
    },
  };

  const getButtonContent = () => {
    if (isStreaming) {
      return <Loader2 className="h-5 w-5 animate-spin" />;
    }
    if (readyState === ReadyState.OPEN) {
      return <SendIcon className="h-5 w-5" />;
    }
    return <Loader2 className="h-5 w-5" />;
  };

  const debouncedAdjustHeight = useCallback(
    debounce(() => {
      if (hiddenDivRef.current && textareaRef.current) {
        hiddenDivRef.current.innerHTML = inputMessage.replace(/\n/g, '<br>') + '<br style="line-height: 3px;">';
        const newHeight = Math.min(hiddenDivRef.current.offsetHeight, 150);
        setTextareaHeight(`${newHeight}px`);
      }
    }, 10),
    [inputMessage]
  );

  useEffect(() => {
    debouncedAdjustHeight();
    return () => {
      debouncedAdjustHeight.cancel();
    };
  }, [inputMessage, debouncedAdjustHeight]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && readyState === ReadyState.OPEN) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isInputDisabled = !conversationId || readyState !== ReadyState.OPEN || isStreaming;

  useEffect(() => {
    const newAllCitations: Record<string, CitationData[]> = {};
    Object.values(citations).forEach(citation => {
      if (!newAllCitations[citation.document_id]) {
        newAllCitations[citation.document_id] = [];
      }
      newAllCitations[citation.document_id].push(citation);
    });
    allCitationsRef.current = newAllCitations;
  }, [citations]);

  return (
    <CitationProvider value={citations} key={citationKey}>
      <div className="flex h-full bg-gradient-to-b from-gray-50 to-white rounded-xl shadow-lg w-full overflow-hidden">
        <div className="flex flex-col flex-grow relative">
          <ScrollArea className="flex-grow mb-4 px-4 py-6">
            {messages.map((msg, index) => (
              <div key={index} className="mb-4">
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="bg-blue-500 p-3 rounded-lg max-w-[70%] shadow-md">
                      <Markdown className="prose prose-sm max-w-none text-white">
                        {msg.content as string}
                      </Markdown>
                    </div>
                  </div>
                ) : msg.role === "assistant" ? (
                  <div className="flex justify-start items-start space-x-2">
                    <div className="bg-white text-gray-800 p-3 rounded-lg max-w-[70%] shadow-md border border-gray-200">
                      <Markdown 
                        className="prose prose-sm max-w-none"
                        options={customMarkdownOptions}
                      >
                        {msg.content as string}
                      </Markdown>
                    </div>
                  </div>
                ) : msg.role === "document_analysis" ? (
                  <DocumentAnalysisGrid
                    totalDocuments={(msg.content as DocumentAnalysisMessage).total_documents}
                    completedDocuments={(msg.content as DocumentAnalysisMessage).completed_documents}
                    documentStatuses={(msg.content as DocumentAnalysisMessage).document_data}
                    onDocumentClick={onDocumentClick}
                  />
                ) : null}
              </div>
            ))}
            {currentAssistantMessage && (
              <div className="flex justify-start items-start space-x-2">
                <div className="bg-white text-gray-800 p-3 rounded-lg max-w-[70%] shadow-md border border-gray-200">
                  <Markdown 
                    className="prose prose-sm max-w-none"
                    options={customMarkdownOptions}
                  >
                    {currentAssistantMessage}
                  </Markdown>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </ScrollArea>
          <div className="border-t bg-white p-4 rounded-b-xl relative">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="reasoning-mode"
                  checked={reasoningMode}
                  onCheckedChange={setReasoningMode}
                  className="data-[state=checked]:bg-blue-500"
                />
                <Label 
                  htmlFor="reasoning-mode" 
                  className="text-sm font-medium text-gray-700 cursor-pointer select-none flex items-center"
                >
                  <LightbulbIcon className="w-4 h-4 mr-1" />
                  Reasoning Mode
                </Label>
              </div>
            </div>
            <div className="relative flex items-end">
              <Textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className={cn(
                  "pr-12 flex-1 bg-gray-100 border-gray-300 resize-none overflow-y-auto transition-all duration-100 rounded-lg",
                  "min-h-[40px] max-h-[150px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                )}
                style={{ height: textareaHeight }}
                disabled={isInputDisabled}
              />
              <div
                ref={hiddenDivRef}
                className="absolute opacity-0 pointer-events-none whitespace-pre-wrap break-words"
                style={{
                  padding: '9px 12px',
                  width: textareaRef.current ? `${textareaRef.current.offsetWidth}px` : 'auto',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  lineHeight: 'inherit',
                }}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={handleSendMessage} 
                      disabled={isInputDisabled}
                      className={cn(
                        "ml-2 p-2 rounded-full transition-colors duration-200",
                        readyState === ReadyState.OPEN 
                          ? "bg-blue-500 hover:bg-blue-600 text-white shadow-md" 
                          : "bg-gray-300 text-gray-500"
                      )}
                    >
                      {getButtonContent()}
                      <span className="sr-only">Send</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{`WebSocket: ${connectionStatus}`}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
    </CitationProvider>
  );
}
