import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileText, Edit, Trash2, Plus, Upload, CheckCircle, XCircle, File, X } from 'lucide-react';
import { fetchDocuments, uploadDocument, deleteDocument, updateDocumentTags, fetchAvailableTags } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserSelections, Document } from '@/lib/types';
import { ManageDocumentsDialog } from './ManageDocumentsDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DataSelectorProps {
  onSelectionChange: (data: UserSelections) => void;
}

interface DocumentRowProps {
  document: Document;
  isSelected: boolean;
  onSelect: (document: Document) => void;
  onEdit: (document: Document) => void;
  onDelete: (documentId: number) => void;
}

const DocumentRow: React.FC<DocumentRowProps> = ({ document, isSelected, onSelect, onEdit, onDelete }) => (
  <motion.div
    className="flex items-center space-x-2 py-2 px-2 border-b last:border-b-0 hover:bg-gray-50 transition-colors duration-200"
    whileHover={{ scale: 1.005 }}
    whileTap={{ scale: 0.995 }}
  >
    <Checkbox
      checked={isSelected}
      onCheckedChange={() => onSelect(document)}
      className="h-3 w-3"
    />
    <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex-grow truncate max-w-[180px] text-sm">{document.filename}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{document.filename}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <div className="flex-shrink-0 ml-auto space-x-1">
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onEdit(document)}>
        <Edit className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onDelete(document.id)}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  </motion.div>
);

export const DataSelector: React.FC<DataSelectorProps> = ({ onSelectionChange }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [tagFilters, setTagFilters] = useState<Array<{key: string, value: string}>>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<Array<{key: string, value: string}>>([]);

  const fetchDocumentsData = useCallback(async () => {
    try {
      const fetchedDocuments = await fetchDocuments(tagFilters);
      setDocuments(fetchedDocuments);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error('Failed to fetch documents');
    }
  }, [tagFilters]);

  useEffect(() => {
    fetchDocumentsData();
  }, [fetchDocumentsData]);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const tags = await fetchAvailableTags();
        setAvailableTags(tags);
      } catch (error) {
        console.error("Error fetching tags:", error);
        toast.error('Failed to fetch tags');
      }
    };
    fetchTags();
  }, []);

  useEffect(() => {
    onSelectionChange({ selectedDocuments });
  }, [selectedDocuments, onSelectionChange]);

  const handleDocumentSelect = useCallback((document: Document) => {
    setSelectedDocuments(prev => {
      const isSelected = prev.some(d => d.id === document.id);
      const newSelection = isSelected
        ? prev.filter(d => d.id !== document.id)
        : [...prev, document];
      setSelectAll(newSelection.length === documents.length);
      return newSelection;
    });
  }, [documents]);

  const handleUploadClick = () => {
    setIsDialogOpen(true);
    setUploadStatus('idle');
    setUploadProgress(0);
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setUploadStatus('idle');
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadStatus('uploading');
    try {
      const uploadedDocument = await uploadDocument(selectedFile, selectedTags);
      setUploadStatus('success');
      
      // Add the new document to the list
      setDocuments(prev => [...prev, {
        id: uploadedDocument.id,
        filename: uploadedDocument.document_filename,
        tags: uploadedDocument.tags
      }]);
      
      toast.success('Document uploaded successfully');
    } catch (error) {
      console.error("Error uploading document:", error);
      setUploadStatus('error');
      toast.error('Failed to upload document');
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
      setSelectedTags([]);
    }
  };

  const handleDeleteDocument = async (document: Document) => {
    try {
      await deleteDocument(document.id);
      setDocuments(prev => prev.filter(d => d.id !== document.id));
      setSelectedDocuments(prev => prev.filter(d => d.id !== document.id));
      toast.success('Document deleted successfully');
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error('Failed to delete document');
    }
  };

  useEffect(() => {
    console.log("DataSelector component mounted");
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedDocuments([...documents]);
    } else {
      setSelectedDocuments([]);
    }
  }, [documents]);

  const handleAddFilter = (tag: string) => {
    const [key, value] = tag.split(':');
    setTagFilters(prev => [...prev, { key, value }]);
  };

  const handleRemoveFilter = (index: number) => {
    setTagFilters(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearFilters = () => {
    setTagFilters([]);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between space-y-0 py-2 px-4">
        <CardTitle className="text-base font-semibold">Documents</CardTitle>
        <div className="flex items-center space-x-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0" 
                  onClick={handleUploadClick}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Upload document</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-grow overflow-auto">
        <div className="px-4 py-2 border-b">
          <div className="flex items-center space-x-2 mb-2">
            <Checkbox
              checked={selectAll}
              onCheckedChange={handleSelectAll}
              id="select-all"
              className="h-3 w-3"
            />
            <Label htmlFor="select-all" className="text-xs font-medium cursor-pointer">
              All
            </Label>
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {tagFilters.map((filter, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {filter.key}:{filter.value}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 ml-1"
                  onClick={() => handleRemoveFilter(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
          <div className="flex items-center space-x-2">
            <select
              className="text-xs border rounded p-1"
              onChange={(e) => handleAddFilter(e.target.value)}
              value=""
            >
              <option value="">Add filter...</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            {tagFilters.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={handleClearFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <FileText className="h-8 w-8 mb-2" />
            <p className="text-sm font-medium">No documents</p>
            <p className="text-xs">Upload to get started</p>
          </div>
        ) : (
          <ScrollArea className="h-full w-full">
            <div className="px-2">
              {documents.map(doc => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  isSelected={selectedDocuments.some(d => d.id === doc.id)}
                  onSelect={handleDocumentSelect}
                  onDelete={() => handleDeleteDocument(doc)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div 
            className={`mt-4 p-4 border-2 border-dashed rounded-md text-center ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {!selectedFile ? (
              <>
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">Drag and drop a file here, or click to select a file</p>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                  accept=".pdf,.txt,.doc,.docx"
                  ref={fileInputRef}
                />
                <Button onClick={() => fileInputRef.current?.click()} className="mt-2">
                  Select File
                </Button>
              </>
            ) : (
              <div className="text-left">
                <File className="h-8 w-8 text-blue-500 mb-2" />
                <p className="font-semibold">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">
                  Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <p className="text-sm text-gray-500">
                  Type: {selectedFile.type || 'Unknown'}
                </p>
              </div>
            )}
          </div>
          {selectedFile && (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-medium">Add Tags</h4>
              <div className="space-y-2">
                {selectedTags.map((tag, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Input
                      value={tag.key}
                      onChange={(e) => {
                        const newTags = [...selectedTags];
                        newTags[index].key = e.target.value;
                        setSelectedTags(newTags);
                      }}
                      placeholder="Key"
                      className="flex-1"
                    />
                    <Input
                      value={tag.value}
                      onChange={(e) => {
                        const newTags = [...selectedTags];
                        newTags[index].value = e.target.value;
                        setSelectedTags(newTags);
                      }}
                      placeholder="Value"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTags(tags => tags.filter((_, i) => i !== index))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTags(tags => [...tags, { key: '', value: '' }])}
                >
                  Add Tag
                </Button>
              </div>
            </div>
          )}
          {uploadStatus === 'uploading' && (
            <div className="mt-4 space-y-2">
              <Progress className="w-full" />
              <p className="text-center text-sm text-gray-600">Uploading...</p>
            </div>
          )}
          {uploadStatus === 'success' && (
            <div className="mt-4 flex items-center justify-center text-green-500">
              <CheckCircle className="mr-2 h-5 w-5" /> Upload Successful
            </div>
          )}
          {uploadStatus === 'error' && (
            <div className="mt-4 flex items-center justify-center text-red-500">
              <XCircle className="mr-2 h-5 w-5" /> Upload Failed
            </div>
          )}
          <DialogFooter>
            {selectedFile && uploadStatus === 'idle' && (
              <Button onClick={handleUpload}>Upload</Button>
            )}
            <Button variant="outline" onClick={() => {
              setIsDialogOpen(false);
              setSelectedFile(null);
              setSelectedTags([]);
              setUploadStatus('idle');
            }}>
              {uploadStatus === 'uploading' ? 'Cancel' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
