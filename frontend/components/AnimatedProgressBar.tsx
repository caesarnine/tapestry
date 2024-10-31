import React, { useState, useEffect } from 'react';
import { Progress } from "@/components/ui/progress";

export const AnimatedProgressBar: React.FC<{ value: number }> = ({ value }) => {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    setAnimatedValue(value);
  }, [value]);

  return (
    <Progress value={animatedValue} className="h-2" />
  );
};
