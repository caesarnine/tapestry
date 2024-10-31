import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parse } from 'date-fns';
import { FaCheck, FaSpinner, FaExclamationTriangle, FaQuestionCircle } from 'react-icons/fa';
import { IoCheckmarkCircle, IoTimeOutline, IoAlertCircle, IoHelpCircle } from 'react-icons/io5';
import { motion } from "framer-motion";

export enum DocumentAnalysisStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETE = "complete", 
  ERROR = "error"
}

export interface DocumentStatus {
  id: string;
  document_date: string;
  status: DocumentAnalysisStatus;
  document_id?: string;
  document_filename?: string;
}

interface DocumentAnalysisGridProps { 
  totalDocuments: number;
  completedDocuments: number;
  documentStatuses: DocumentStatus[];
  onDocumentClick: (document: DocumentStatus) => void;
}

const AnimatedProgressBar: React.FC<{ value: number }> = ({ value }) => {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    setAnimatedValue(value);
  }, [value]);

  return (
    <Progress value={animatedValue} className="h-2" />
  );
};

const DocumentAnalysisGrid: React.FC<DocumentAnalysisGridProps> = ({
  totalDocuments,
  completedDocuments,
  documentStatuses,
  onDocumentClick,
}) => {
  const [derivedTotalDocuments, setDerivedTotalDocuments] = useState(totalDocuments);

  useEffect(() => {
    if (totalDocuments === 0 && documentStatuses.length > 0) {
      setDerivedTotalDocuments(documentStatuses.length);
    } else {
      setDerivedTotalDocuments(totalDocuments);
    }
  }, [totalDocuments, documentStatuses]);

  const progress = useMemo(() => 
    derivedTotalDocuments > 0 ? (completedDocuments / derivedTotalDocuments) * 100 : 0,
  [derivedTotalDocuments, completedDocuments]);

  const getSymbolColor = useCallback((symbol: string) => {
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 65%, 55%)`; // Adjusted saturation and lightness for a modern look
  }, []);

  const getStatusColor = useCallback((status: DocumentAnalysisStatus) => {
    switch (status) {
      case DocumentAnalysisStatus.COMPLETE:
        return 'bg-green-500 hover:bg-green-600';
      case DocumentAnalysisStatus.IN_PROGRESS:
        return 'bg-yellow-500 hover:bg-yellow-600';
      case DocumentAnalysisStatus.ERROR:
        return 'bg-red-500 hover:bg-red-600';
      case DocumentAnalysisStatus.PENDING:
      default:
        return 'bg-gray-400 hover:bg-gray-500';
    }
  }, []);

  const getStatusIcon = useCallback((status: DocumentAnalysisStatus) => {
    switch (status) {
      case DocumentAnalysisStatus.COMPLETE:
        return <IoCheckmarkCircle className="text-white w-3 h-3" />;
      case DocumentAnalysisStatus.IN_PROGRESS:
        return <IoTimeOutline className="text-white w-3 h-3 animate-spin" />;
      case DocumentAnalysisStatus.ERROR:
        return <IoAlertCircle className="text-white w-3 h-3" />;
      case DocumentAnalysisStatus.PENDING:
      default:
        return <IoHelpCircle className="text-white w-3 h-3" />;
    }
  }, []);

  const DocumentTile: React.FC<{ document: DocumentStatus; index: number }> = React.memo(({ document, index }) => {
    const formatDate = (dateString: string | undefined) => {
      if (!dateString || dateString === '?') return 'Unknown';
      try {
        return format(parse(dateString, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
      } catch {
        return 'Invalid Date';
      }
    };

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div
              className={`
                w-8 h-8 m-0.5
                cursor-pointer
                flex items-center justify-center
                ${getStatusColor(document.status)}
                rounded-md
                transition-colors duration-200
                shadow-sm
              `}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              role="button"
              aria-label={`Document ${index + 1} - Status: ${document.status}`}
              onClick={() => onDocumentClick(document)}
            >
              {getStatusIcon(document.status)}
            </motion.div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <p className="font-semibold">Document {index + 1}</p>
              <p>Status: {document.status.charAt(0).toUpperCase() + document.status.slice(1)}</p>
              <p>Date: {formatDate(document.document_date)}</p>
              {document.document_filename && <p>Filename: {document.document_filename}</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  });

  DocumentTile.displayName = 'DocumentTile';

  const memoizedDocumentTiles = useMemo(() => {
    const statusesToRender = documentStatuses.length > 0 
      ? documentStatuses 
      : Array.from({ length: totalDocuments }, (_, index) => ({
          id: `pending-${index}`,
          document_date: '?',
          status: DocumentAnalysisStatus.PENDING
        }));

    return statusesToRender.map((document, index) => (
      <DocumentTile key={document.id} document={document} index={index} />
    ));
  }, [documentStatuses, totalDocuments, DocumentTile, getStatusColor]);

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Document Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm font-medium text-gray-700">
              {completedDocuments} of {derivedTotalDocuments}
            </span>
          </div>
          <AnimatedProgressBar value={progress} />
        </div>
        <div className="flex flex-wrap justify-start">
          {memoizedDocumentTiles}
        </div>
      </CardContent>
    </Card>
  );
};

export default React.memo(DocumentAnalysisGrid);
