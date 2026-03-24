// filepath: /life-organizer-web/life-organizer-web/src/types/index.ts
export interface User {
  id: string;
  username: string;
  email: string;
  profilePicture?: string;
}

export interface Post {
  id: string;
  userId: string;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  content: string;
  createdAt: Date;
}

export interface SidebarLink {
  label: string;
  icon: string;
  path: string;
}

export interface Theme {
  mode: 'light' | 'dark';
  colors: {
    background: string;
    text: string;
    primary: string;
    secondary: string;
  };
}