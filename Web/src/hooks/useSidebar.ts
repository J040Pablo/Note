import { useState } from 'react';

const useSidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => {
    setIsOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    toggleSidebar,
    closeSidebar,
  };
};

export default useSidebar;