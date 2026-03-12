// Trip Request Form Component
// Redirects to My Trip Requests with the modal open for consistency

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function TripRequestForm() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/fleet/my-trips', { replace: true, state: { openModal: true } });
  }, [navigate]);

  return null;
}

export default TripRequestForm;
