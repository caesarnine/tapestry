import React, { createContext, useContext, useMemo, useState, useCallback, useRef } from 'react';
import * as HoverCard from '@radix-ui/react-hover-card';
import { CalendarIcon, ClockIcon } from '@heroicons/react/20/solid';

export interface CitationData {
  id: string;
  document_id: string;
  document_date: string; // Add date field
  document_filename: string;
  text: string;
}

interface CitationContextType {
  citations: Record<string, CitationData>;
  idMapping: Record<string, number>;
  useCitation: (id: string) => number;
}

const CitationContext = createContext<CitationContextType>({ 
  citations: {}, 
  idMapping: {}, 
  useCitation: () => 0 
});

export const CitationProvider: React.FC<{ value: Record<string, CitationData>; children: React.ReactNode }> = ({ value, children }) => {
  const [usedCitations, setUsedCitations] = useState<string[]>([]);
  const usedCitationsRef = useRef<string[]>([]);

  const useCitation = useCallback((id: string) => {
    if (!usedCitationsRef.current.includes(id)) {
      setUsedCitations(prev => {
        const newUsedCitations = [...prev, id];
        usedCitationsRef.current = newUsedCitations;
        return newUsedCitations;
      });
    }
    return usedCitationsRef.current.indexOf(id) + 1;
  }, []);

  const contextValue = useMemo(() => {
    const idMapping: Record<string, number> = {};
    return { citations: value, idMapping, useCitation };
  }, [value, useCitation]);

  return (
    <CitationContext.Provider value={contextValue}>
      {children}
    </CitationContext.Provider>
  );
};

export const CitationReference = React.memo(({ id, onClick }: { id: string; onClick?: () => void }) => {
  const { citations, useCitation } = useContext(CitationContext);
  const citation = citations[id];
  const displayId = useCitation(id);

  if (!citation) {
    return <sup>[{displayId}]</sup>;
  }

  return (
    <HoverCard.Root openDelay={100} closeDelay={300}>
      <HoverCard.Trigger asChild>
        <sup
          className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded cursor-pointer hover:bg-blue-100 hover:border-blue-300 transition-all duration-200 align-baseline relative top-[-0.2em]"
          onClick={onClick}
        >
          {displayId}
        </sup>
      </HoverCard.Trigger>
      <HoverCard.Content className="w-96 p-0 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
        <HoverCard.Arrow className="fill-white" />
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white p-3 rounded-t-lg">
          <div className="font-semibold text-sm overflow-hidden text-ellipsis whitespace-nowrap">
            {citation.document_filename}
          </div>
        </div>
        <div className="p-3">
          <div className="text-sm text-gray-700">{citation.text}</div>
        </div>
      </HoverCard.Content>
    </HoverCard.Root>
  );
});

CitationReference.displayName = 'CitationReference';
