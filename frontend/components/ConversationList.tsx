import React from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  selectedConversationId: string | null;
}

const ConversationItem: React.FC<{
  conversation: Conversation;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ conversation, isSelected, onSelect, onDelete }) => (
  <motion.div
    className={`flex items-center space-x-2 py-2 px-2 border-b last:border-b-0 hover:bg-gray-50 transition-colors duration-200 ${
      isSelected ? 'bg-blue-50' : ''
    }`}
    whileHover={{ scale: 1.005 }}
    whileTap={{ scale: 0.995 }}
  >
    <Button
      onClick={onSelect}
      className="flex-grow flex items-center justify-start text-left p-0 h-auto"
      variant="ghost"
    >
      <MessageSquare className="h-4 w-4 text-blue-500 flex-shrink-0 mr-2" />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate max-w-[180px] text-sm">{conversation.title}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{conversation.title}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </Button>
    <Button
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 ml-auto"
    >
      <Trash2 className="h-3 w-3" />
    </Button>
  </motion.div>
);

export default function ConversationList({
  conversations,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  selectedConversationId
}: ConversationListProps) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between space-y-0 py-2 px-4">
        <CardTitle className="text-base font-semibold">Conversations</CardTitle>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onNewConversation}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">New conversation</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="p-0 flex-grow overflow-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <MessageSquare className="h-8 w-8 mb-2" />
            <p className="text-sm font-medium">No conversations</p>
            <p className="text-xs">Start a new conversation</p>
          </div>
        ) : (
          <ScrollArea className="h-full w-full">
            <div className="px-2">
              {conversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={selectedConversationId === conversation.id}
                  onSelect={() => onSelectConversation(conversation.id)}
                  onDelete={() => onDeleteConversation(conversation.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
