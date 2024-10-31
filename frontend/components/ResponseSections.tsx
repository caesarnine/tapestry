import React from 'react';
import { cn } from "@/lib/utils";

interface HeaderProps {
  children: React.ReactNode;
}

const headerStyles: Record<string, string> = {
  facts: 'border-blue-400 text-blue-700 bg-blue-50',
  thinking: 'border-purple-400 text-purple-700 bg-purple-50',
  action: 'border-green-400 text-green-700 bg-green-50',
  draft: 'border-orange-300 text-orange-700 bg-orange-50',
  answer: 'border-teal-400 text-teal-700 bg-teal-50',
  reflection: 'border-sky-300 text-sky-700 bg-sky-50',
};

export const Header: React.FC<HeaderProps> = ({ children }) => {
  const text = React.Children.toArray(children).join('').toLowerCase();
  const style = Object.keys(headerStyles).find(key => text.startsWith(key))
    ? headerStyles[Object.keys(headerStyles).find(key => text.startsWith(key)) as keyof typeof headerStyles]
    : 'border-gray-400 text-gray-700 bg-gray-50';

  return (
    <h4 className={cn(
      "px-3 py-1 mb-2 mt-3 text-sm font-medium",
      "border-l-2 rounded-r-md",
      "transition-all duration-200 ease-in-out",
      "hover:pl-4",
      style
    )}>
      {children}
    </h4>
  );
};

export default Header;
