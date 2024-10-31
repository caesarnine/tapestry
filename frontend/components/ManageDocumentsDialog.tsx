import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Document } from '@/lib/types';
import { Badge } from "@/components/ui/badge";
import { X } from 'lucide-react';

interface ManageDocumentsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documents: Document[];
  onDeleteDocument: (documentId: number) => Promise<void>;
  onUpdateDocumentTags: (documentId: number, tags: string[]) => Promise<void>;
  availableTags: string[];
}

export const ManageDocumentsDialog: React.FC<ManageDocumentsDialogProps> = ({
  isOpen,
  onClose,
  documents,
  onDeleteDocument,
  onUpdateDocumentTags,
  availableTags,
}) => {
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  const handleEditTags = (document: Document) => {
    setEditingDocument(document);
    setEditingTags(document.tags || []);
  };

  const handleSaveTags = async () => {
    if (editingDocument) {
      await onUpdateDocumentTags(editingDocument.id, editingTags);
      setEditingDocument(null);
      setNewTag('');
    }
  };

  const handleAddTag = () => {
    if (newTag && !editingTags.includes(newTag)) {
      setEditingTags([...editingTags, newTag]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setEditingTags(editingTags.filter(t => t !== tag));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Manage Documents</DialogTitle>
        </DialogHeader>
        <ScrollArea className="mt-4 max-h-[60vh] pr-4">
          {documents.map((document) => (
            <div key={document.id} className="py-4 border-b last:border-b-0">
              <div className="flex justify-between items-start">
                <span className="font-medium text-lg truncate max-w-[300px]" title={document.filename}>
                  {document.filename}
                </span>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditTags(document)}
                    className="mr-2"
                  >
                    Edit Tags
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDeleteDocument(document.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {editingDocument?.id === document.id && (
                <div className="mt-4 space-y-4">
                  <div>
                    <Label htmlFor="tags" className="text-sm font-medium">Current Tags</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {editingTags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs py-1 px-2">
                          {tag}
                          <button onClick={() => handleRemoveTag(tag)} className="ml-2 text-gray-500 hover:text-gray-700">
                            <X size={14} />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="Add new tag"
                      className="flex-grow"
                    />
                    <Button onClick={handleAddTag} size="sm">Add</Button>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSaveTags} size="sm">Save Tags</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
