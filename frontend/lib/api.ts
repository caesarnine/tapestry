import axios, { AxiosError } from 'axios';
import { Conversation, User, Document } from './types';

const API_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:8000/api' 
  : (typeof window !== 'undefined' && window.location.origin 
    ? `${window.location.origin}/api` 
    : 'https://accountingbot.io/api');

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token has expired or is invalid
      localStorage.removeItem('access_token');
      window.dispatchEvent(new Event('auth_error'));
    }
    return Promise.reject(error);
  }
);

export const login = async (username: string, password: string): Promise<{ access_token: string }> => {
  const response = await api.post(`/users/token`, new URLSearchParams({
    username,
    password,
  }));
  return response.data;
};

export const register = async (username: string, email: string, password: string): Promise<User> => {
  const response = await api.post(`/users/register`, { username, email, password });
  return response.data;
};

export const getAuthHeader = () => {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchConversations = async (): Promise<Conversation[]> => {
  const response = await api.get(`/chat/conversations`, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const createConversation = async (title: string = "New Conversation"): Promise<Conversation> => {
  const response = await api.post(`/chat/conversations`, { title }, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const getConversation = async (id: string): Promise<Conversation> => {
  const response = await api.get(`/chat/conversations/${id}`, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const getWebSocketUrl = (conversationId: string | null): string | null => {
  const token = localStorage.getItem('access_token');
  if (!token) return null;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = process.env.NODE_ENV === 'development' ? 'localhost:8000' : 'accountingbot.io';
  return `${protocol}//${host}/api/chat/ws/${conversationId || 'null'}?token=${token}`;
};

export const fetchDocuments = async (tags?: Array<{key: string, value: string}>): Promise<Document[]> => {
  const params: any = {};
  if (tags && tags.length > 0) {
    params.tags = tags.map(tag => `${tag.key}:${tag.value}`).join(',');
  }
  
  const response = await api.get(`/documents`, {
    params,
    headers: getAuthHeader(),
  });
  return response.data.documents;
};

export const fetchDocumentById = async (id: number): Promise<Document> => {
  const response = await api.get(`/documents/${id}`, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const uploadDocument = async (file: File, tags: Array<{key: string, value: string}>): Promise<Document> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('tags', JSON.stringify(tags));

  const response = await api.post(`/documents/upload`, formData, {
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data.document;
};

export const fetchAvailableTags = async (): Promise<string[]> => {
  const response = await api.get(`/documents/tags`, {
    headers: getAuthHeader(),
  });
  return response.data.tags;
};

export const deleteConversation = async (id: string): Promise<void> => {
  await api.delete(`/chat/conversations/${id}`, {
    headers: getAuthHeader(),
  });
};

export const updateConversationTitle = async (id: string, title: string): Promise<Conversation> => {
  const response = await api.put(`/chat/conversations/${id}/title`, { title }, {
    headers: getAuthHeader(),
  });
  return response.data;
};

export const deleteDocument = async (id: number): Promise<void> => {
  await api.delete(`/documents/${id}`, {
    headers: getAuthHeader(),
  });
};

export const updateDocumentTags = async (id: number, tags: string[]): Promise<Document> => {
  const response = await api.put(`/documents/${id}/tags`, { tags }, {
    headers: getAuthHeader(),
  });
  return response.data;
};
