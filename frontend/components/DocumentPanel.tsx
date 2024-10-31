'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { FileText, X, Maximize2, Minimize2, Loader2, ChartNoAxesColumnDecreasing, Calendar, BarChart, Info } from "lucide-react";
import { CitationData } from './Citation';
import { Document} from '@/lib/api';
import Fuse from 'fuse.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DocumentPanelProps {
  document: Document;
  onClose: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedCitation: CitationData | null;
  documentCitations: CitationData[];
  isLoading: boolean;
}

const InfoTooltip = ({ content, children }: { content: React.ReactNode, children: React.ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="bottom" className="text-xs max-w-xs">
      {content}
    </TooltipContent>
  </Tooltip>
);

export default function DocumentPanel({
  document,
  onClose,
  isExpanded,
  onToggleExpand,
  selectedCitation,
  documentCitations,
  isLoading
}: DocumentPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [renderedContent, setRenderedContent] = useState<React.ReactNode | null>(null);
  const [highlightedCitationId, setHighlightedCitationId] = useState<string | null>(null);

  console.log('DocumentPanel render', { document, isLoading, selectedCitation });

  const renderContent = useCallback((content: string) => {
    console.log('Rendering content', { contentLength: content.length });
    // Split the content by speaker
    const speakerSections = content.split(/(?=^[^:\n]+:)/m);
    
    return speakerSections.map((section, index) => {
      // Use a regular expression to match the speaker at the beginning of the section
      const match = section.match(/^([^:]+):\s*([\s\S]*)/);
      if (match) {
        const [, speaker, text] = match;
        const paragraphs = text.trim().split('\n').filter(p => p.trim() !== '');
        
        return (
          <div key={index} className="mb-6 bg-gray-50 rounded-md p-4 shadow-sm">
            <div className="font-semibold text-gray-700 mb-2">{speaker.trim()}</div>
            <div className="text-gray-600 pl-3 border-l-2 border-gray-300 space-y-2">
              {paragraphs.map((paragraph, pIndex) => (
                <p key={pIndex} className="text-sm">
                  {highlightCitationInParagraph(paragraph.trim(), `${index}-${pIndex}`)}
                </p>
              ))}
            </div>
          </div>
        );
      }
      // If there's no speaker (e.g., introductory text), render it as a regular paragraph
      return (
        <div key={index} className="mb-4 bg-white rounded-md p-3 shadow-sm">
          {section.split('\n').map((paragraph, pIndex) => (
            <p key={pIndex} className="mb-1 text-gray-700 text-sm">
              {highlightCitationInParagraph(paragraph.trim(), `${index}-${pIndex}`)}
            </p>
          ))}
        </div>
      );
    });
  }, [selectedCitation, highlightedCitationId]);

  useEffect(() => {
    console.log('Document or isLoading changed', { document, isLoading });
    if (document && !isLoading) {
      console.log('Setting rendered content');
      setRenderedContent(renderContent(document.content));
    } else {
      console.log('Clearing rendered content');
      setRenderedContent(null);
    }
  }, [document, isLoading, renderContent]);

  useEffect(() => {
    console.log('selectedCitation changed', { selectedCitation });
    if (selectedCitation && renderedContent) {
      const citationId = `citation-${selectedCitation.id}`;
      setHighlightedCitationId(citationId);
      scrollToCitation(citationId);
    }
  }, [selectedCitation, renderedContent]);

  const scrollToCitation = useCallback((citationId: string) => {
    console.log('Scrolling to citation', { citationId });
    if (typeof window === 'undefined' || !contentRef.current || !scrollAreaRef.current) return;

    setTimeout(() => {
      const highlightedElement = contentRef.current?.querySelector(`#${citationId}`);
      if (highlightedElement && scrollAreaRef.current) {
        const scrollableContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollableContainer) {
          highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 100);
  }, []);

  const highlightCitationInParagraph = useCallback((paragraph: string, paragraphKey: string) => {
    if (!selectedCitation) return paragraph;

    // Helper function to clean text
    const cleanText = (text: string) => {
      return text.toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");
    };

    // Function to highlight the matched text
    const highlightMatch = (startIndex: number, endIndex: number) => (
      <>
        {paragraph.slice(0, startIndex)}
        <mark
          key={`${paragraphKey}-highlight`}
          id={highlightedCitationId || undefined}
          className="bg-yellow-200"
        >
          {paragraph.slice(startIndex, endIndex)}
        </mark>
        {paragraph.slice(endIndex)}
      </>
    );

    // Try exact match first
    const exactMatchIndex = paragraph.indexOf(selectedCitation.text);
    if (exactMatchIndex !== -1) {
      return highlightMatch(exactMatchIndex, exactMatchIndex + selectedCitation.text.length);
    }

    // If exact match fails, try with cleaned text
    const cleanedParagraph = cleanText(paragraph);
    const cleanedCitation = cleanText(selectedCitation.text);
    const cleanedMatchIndex = cleanedParagraph.indexOf(cleanedCitation);

    if (cleanedMatchIndex !== -1) {
      // Map the cleaned match back to the original text
      let originalIndex = 0;
      let cleanedIndex = 0;
      while (cleanedIndex < cleanedMatchIndex) {
        if (cleanText(paragraph[originalIndex]) !== '') {
          cleanedIndex++;
        }
        originalIndex++;
      }
      const startIndex = originalIndex;
      while (cleanedIndex < cleanedMatchIndex + cleanedCitation.length) {
        if (cleanText(paragraph[originalIndex]) !== '') {
          cleanedIndex++;
        }
        originalIndex++;
      }
      const endIndex = originalIndex;

      return highlightMatch(startIndex, endIndex);
    }

    // If no match is found, return the original paragraph
    return paragraph;
  }, [selectedCitation, highlightedCitationId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  console.log('Rendering DocumentPanel', { hasRenderedContent: !!renderedContent });

  return (
    <div className="flex flex-col h-full bg-white shadow-lg rounded-lg">
      <TooltipProvider>
        <div className="p-3 border-b bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-gray-400" />
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  {document?.company?.symbol || 'Unknown'}
                </h2>
                {document?.company?.company_name && (
                  <p className="text-xs text-gray-500">{document.company.company_name}</p>
                )}
              </div>
            </div>
            <div className="flex space-x-1">
              <InfoTooltip content={isExpanded ? "Minimize" : "Maximize"}>
                <Button variant="ghost" size="sm" onClick={onToggleExpand}>
                  {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </InfoTooltip>
              <InfoTooltip content="Close">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </InfoTooltip>
            </div>
          </div>

          <div className="flex flex-wrap items-center text-xs text-gray-600 space-x-3">
            {document?.type && (
              <InfoTooltip content="Document Type">
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                  {document.type.replace('_', ' ')}
                </span>
              </InfoTooltip>
            )}
            <InfoTooltip content="Document Date">
              <span className="flex items-center">
                <Calendar className="h-3 w-3 mr-1" />
                {document?.date ? document.date : 'N/A'}
              </span>
            </InfoTooltip>
            <InfoTooltip content="Fiscal Period">
              <span className="flex items-center">
                <BarChart className="h-3 w-3 mr-1" />
                {document?.additional_data?.fiscal_year ? `FY ${document.additional_data.fiscal_year}` : 'N/A'}
                {document?.additional_data?.fiscal_quarter && ` - Q${document.additional_data.fiscal_quarter}`}
              </span>
            </InfoTooltip>
            
            {document?.additional_data && Object.keys(document.additional_data).length > 0 && (
              <InfoTooltip
                content={
                  <div>
                    <h3 className="font-semibold mb-1">Additional Information</h3>
                    {Object.entries(document.additional_data).map(([key, value]) => (
                      <div key={key} className="mb-1">
                        <span className="font-medium">{key.replace('_', ' ')}:</span> {value}
                      </div>
                    ))}
                  </div>
                }
              >
                <Button variant="ghost" size="sm" className="p-0 h-auto">
                  <Info className="h-3 w-3 text-gray-400" />
                </Button>
              </InfoTooltip>
            )}
          </div>
        </div>
      </TooltipProvider>
      
      {/* Scroll area and content */}
      <ScrollArea ref={scrollAreaRef} className="flex-grow">
        <div ref={contentRef} className="p-6 space-y-6">
          {renderedContent}
        </div>
      </ScrollArea>
    </div>
  );
}
