export interface UserSelections {
  selectedTags: { key: string; value: string }[];
  selectedDocuments: { id: number; filename: string }[];
  reasoningMode: boolean;
}

export interface Document {
  id: number;
  date: string;
  content: string;
  document_filename: string;
  tags: Array<{ [key: string]: string }>;
}

export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
}
