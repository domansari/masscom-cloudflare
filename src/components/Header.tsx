
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';

const Header = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <header className="no-print border-b border-white/15 bg-black/75 text-white shadow-sm backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
          <nav aria-label="Main website" className="flex items-center gap-2">
            <a href="https://www.masscom.co.in/" aria-label="Home" title="Home" className="shrink-0 rounded focus-visible:outline focus-visible:outline-2">
              <img src="https://www.masscom.co.in/assets/logo-121x131.png" alt="" width={24} height={26} className="rounded bg-white object-contain" />
            </a>
            <span className="student-record-title">Student Record Managment</span>
          </nav>

          {user && <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <User className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="break-all text-sm text-white">
                {profile?.full_name || user.email}
              </span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="h-8 gap-2 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </Button>
          </div>}
        </div>
      </div>
    </header>
  );
};

export default Header;
