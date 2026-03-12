'use client';

import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { User, authenticateUser, createUser, getUserByEmail, getUserByUsername, updateUser } from '@/db/indexeddb';
import { initializeApp } from '@/db/appInit';
import { v4 as uuidv4 } from 'uuid';
import { signInWithGoogle } from '@/lib/googleAuth';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

type AuthAction =
  | { type: 'SET_USER'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_INITIALIZED' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload, error: null, isLoading: false };
    case 'LOGOUT':
      return { ...state, user: null, isLoading: false };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: true };
    default:
      return state;
  }
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  login: (usernameOrEmail: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => void;
  registerStudent: (data: RegisterStudentData) => Promise<boolean>;
  registerStudentWithGoogle: (grade: number) => Promise<boolean>;
  registerTeacher: (data: RegisterTeacherData) => Promise<boolean>;
  clearError: () => void;
  updateCurrentUser: (user: User) => void;
}

export interface RegisterStudentData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  grade: number;
}

export interface RegisterTeacherData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isLoading: true,
    isInitialized: false,
    error: null,
  });

  // Initialize app and restore session on mount
  useEffect(() => {
    async function init() {
      try {
        await initializeApp();
        dispatch({ type: 'SET_INITIALIZED' });

        // Restore session from sessionStorage
        const savedUser = sessionStorage.getItem('readstar_user');
        if (savedUser) {
          const user = JSON.parse(savedUser) as User;
          dispatch({ type: 'SET_USER', payload: user });
        } else {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (err) {
        console.error('App initialization error:', err);
        dispatch({ type: 'SET_INITIALIZED' });
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
    init();
  }, []);

  const login = useCallback(async (usernameOrEmail: string, password: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const user = await authenticateUser(usernameOrEmail, password);
      if (user) {
        sessionStorage.setItem('readstar_user', JSON.stringify(user));
        dispatch({ type: 'SET_USER', payload: user });
        return true;
      } else {
        dispatch({ type: 'SET_ERROR', payload: 'Invalid username or password.' });
        return false;
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: 'Login failed. Please try again.' });
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('readstar_user');
    dispatch({ type: 'LOGOUT' });
  }, []);

  const buildUniqueUsername = useCallback(async (seed: string) => {
    const base = seed
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 16) || `google${Math.floor(Math.random() * 10000)}`;

    let candidate = base;
    let counter = 1;
    while (await getUserByUsername(candidate)) {
      candidate = `${base}${counter}`;
      counter += 1;
    }
    return candidate;
  }, []);

  const registerStudent = useCallback(async (data: RegisterStudentData): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const existing = await getUserByEmail(data.email) || await getUserByUsername(data.username);
      if (existing) {
        dispatch({ type: 'SET_ERROR', payload: 'Username or email already exists.' });
        return false;
      }
      const user: User = {
        id: uuidv4(),
        username: data.username,
        email: data.email,
        password: data.password,
        role: 'student',
        firstName: data.firstName,
        lastName: data.lastName,
        grade: data.grade,
        createdAt: Date.now(),
        lastActive: Date.now(),
        defaultDifficulty: 'simple',
        language: 'en-US',
        streak: 0,
        totalStars: 0,
        teacherNotes: [],
      };
      await createUser(user);
      dispatch({ type: 'SET_LOADING', payload: false });
      return true;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: 'Registration failed. Please try again.' });
      return false;
    }
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const googleProfile = await signInWithGoogle();
      const existing = await getUserByEmail(googleProfile.email);
      if (!existing) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'No account found for this Google email. Please create an account first.',
        });
        return false;
      }

      const updatedUser: User = {
        ...existing,
        firstName: googleProfile.firstName || existing.firstName,
        lastName: googleProfile.lastName || existing.lastName,
        profilePicture: googleProfile.picture ?? existing.profilePicture,
        lastActive: Date.now(),
      };

      await updateUser(updatedUser);

      sessionStorage.setItem('readstar_user', JSON.stringify(updatedUser));
      dispatch({ type: 'SET_USER', payload: updatedUser });
      return true;
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: err instanceof Error ? err.message : 'Google sign-in failed. Please try again.',
      });
      return false;
    }
  }, []);

  const registerStudentWithGoogle = useCallback(async (grade: number): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const googleProfile = await signInWithGoogle();
      const existing = await getUserByEmail(googleProfile.email);
      if (existing) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'An account with this Google email already exists. Please sign in instead.',
        });
        return false;
      }

      const username = await buildUniqueUsername(googleProfile.email.split('@')[0] || googleProfile.firstName);
      const newUser: User = {
        id: uuidv4(),
        username,
        email: googleProfile.email,
        password: '',
        role: 'student',
        firstName: googleProfile.firstName,
        lastName: googleProfile.lastName,
        grade,
        createdAt: Date.now(),
        lastActive: Date.now(),
        defaultDifficulty: 'simple',
        language: 'en-US',
        streak: 0,
        totalStars: 0,
        teacherNotes: [],
        profilePicture: googleProfile.picture,
      };
      await createUser(newUser);
      dispatch({ type: 'SET_LOADING', payload: false });
      return true;
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: err instanceof Error ? err.message : 'Google registration failed. Please try again.',
      });
      return false;
    }
  }, [buildUniqueUsername]);

  const registerTeacher = useCallback(async (data: RegisterTeacherData): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const existing = await getUserByEmail(data.email) || await getUserByUsername(data.username);
      if (existing) {
        dispatch({ type: 'SET_ERROR', payload: 'Username or email already exists.' });
        return false;
      }
      const user: User = {
        id: uuidv4(),
        username: data.username,
        email: data.email,
        password: data.password,
        role: 'teacher',
        firstName: data.firstName,
        lastName: data.lastName,
        createdAt: Date.now(),
        lastActive: Date.now(),
        language: 'en-US',
      };
      await createUser(user);
      dispatch({ type: 'SET_LOADING', payload: false });
      return true;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: 'Registration failed. Please try again.' });
      return false;
    }
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  const updateCurrentUser = useCallback((user: User) => {
    sessionStorage.setItem('readstar_user', JSON.stringify(user));
    dispatch({ type: 'SET_USER', payload: user });
  }, []);

  return (
    <AuthContext.Provider value={{
      user: state.user,
      isLoading: state.isLoading,
      isInitialized: state.isInitialized,
      error: state.error,
      login,
      loginWithGoogle,
      logout,
      registerStudent,
      registerStudentWithGoogle,
      registerTeacher,
      clearError,
      updateCurrentUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
