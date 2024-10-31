type Section = {
    type: 'text' | 'facts' | 'thinking' | 'action';
    content: string;
  };
  
  export function parseStreamedContent(content: string): Section[] {
    const sections: Section[] = [];
    let currentSection: Section = { type: 'text', content: '' };
    
    const lines = content.split('\n');
    let inSpecialSection = false;
  
    for (const line of lines) {
      if (line.startsWith('<facts>')) {
        if (currentSection.content) sections.push(currentSection);
        currentSection = { type: 'facts', content: '' };
        inSpecialSection = true;
      } else if (line.startsWith('<thinking>')) {
        if (currentSection.content) sections.push(currentSection);
        currentSection = { type: 'thinking', content: '' };
        inSpecialSection = true;
      } else if (line.startsWith('<action>')) {
        if (currentSection.content) sections.push(currentSection);
        currentSection = { type: 'action', content: '' };
        inSpecialSection = true;
      } else if (line.startsWith('</facts>') || line.startsWith('</thinking>') || line.startsWith('</action>')) {
        if (currentSection.content) sections.push(currentSection);
        currentSection = { type: 'text', content: '' };
        inSpecialSection = false;
      } else {
        if (inSpecialSection || currentSection.type !== 'text') {
          currentSection.content += line + '\n';
        } else {
          if (currentSection.content) currentSection.content += '\n';
          currentSection.content += line;
        }
      }
    }
  
    if (currentSection.content) sections.push(currentSection);
  
    return sections;
  }