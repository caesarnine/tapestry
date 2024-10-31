import React from 'react';
import { DataSelector } from '@/components/DataSelector';
import ConversationList from '@/components/ConversationList';
import { UserSelections, Conversation } from '@/lib/types';

interface SidebarProps {
  onDataSelectionChange: (newData: UserSelections) => void;
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  selectedConversationId: string | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  onDataSelectionChange,
  conversations,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  selectedConversationId,
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <DataSelector onSelectionChange={onDataSelectionChange} />
        </div>
        <div className="h-4" /> {/* Spacer */}
        <div className="flex-1 min-h-0 overflow-auto">
          <ConversationList
            conversations={conversations}
            onSelectConversation={onSelectConversation}
            onNewConversation={onNewConversation}
            onDeleteConversation={onDeleteConversation}
            selectedConversationId={selectedConversationId}
          />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
