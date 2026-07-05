export type AppUser = {
  id: number;
  email: string;
  first_name: string;
};

export type AuthResponse = {
  token: string;
  user: AppUser;
};
