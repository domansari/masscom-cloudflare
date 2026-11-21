
import React from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';

const Header = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (!user) return null;

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-2">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold text-primary">
              Masscom Infotech Education
            </h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Link className="text-sm font-semibold underline" to="/marksheets">Mark Sheets</Link>
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4" />
              <span className="text-sm text-gray-700">
                {profile?.full_name || user.email}
              </span>
              {profile?.role === 'admin' && (
                <span className="bg-primary text-white text-xs px-2 py-1 rounded">
                  Admin
                </span>
              )}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="flex items-center space-x-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
