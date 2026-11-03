import React from 'react';
import { usePlanner } from '../../context/PlannerContext';
import { Modal } from '../common/ModalBackdrop';
import { UniversalLocationSearch } from '../location/UniversalLocationSearch';
import { SearchResultPlace } from '../../types/search';
import { Waypoint } from '../../types/route';

interface PlaceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMode?: 'waypoint' | 'origin' | 'destination';
}

export const PlaceSearchModal: React.FC<PlaceSearchModalProps> = ({
  isOpen,
  onClose,
  targetMode = 'waypoint'
}) => {
  const { trip, setTrip, replanRoute, showToast } = usePlanner();

  const handleSelectPlace = (
    place: SearchResultPlace,
    actionType?: 'via' | 'charging' | 'origin' | 'destination'
  ) => {
    if (targetMode === 'origin' || actionType === 'origin') {
      const nextOrigin = {
        ...trip.origin,
        name: place.name,
        subTitle: place.subTitle || place.address,
        address: place.address,
        coordinates: place.coordinates
      };
      setTrip((prev) => ({
        ...prev,
        origin: nextOrigin
      }));
      showToast(`Origin set to "${place.name}"`);
      onClose();
      replanRoute({ origin: nextOrigin });
    } else if (targetMode === 'destination' || actionType === 'destination') {
      const nextDest = {
        ...trip.destination,
        name: place.name,
        subTitle: place.subTitle || place.address,
        address: place.address,
        coordinates: place.coordinates
      };
      setTrip((prev) => ({
        ...prev,
        destination: nextDest
      }));
      showToast(`Destination set to "${place.name}"`);
      onClose();
      replanRoute({ destination: nextDest });
    } else {
      const isCharging = actionType === 'charging' || place.isChargingStation;
      const newWp: Waypoint = {
        id: `${isCharging ? 'charging' : 'via'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: place.name,
        subTitle: place.stationData
          ? `${place.stationData.network} • ${place.stationData.ratedPowerKw} kW DC`
          : place.subTitle || (isCharging ? 'Charging Station' : place.address),
        address: place.address,
        coordinates: place.coordinates,
        batterySoc: isCharging ? 15 : 25,
        type: isCharging ? 'charging_pinned' : 'via',
        category: place.category,
        source: place.source,
        stationId: place.stationData?.id,
        verificationState: place.verificationState,
        targetChargeSoc: isCharging ? 80 : undefined,
        isCustom: true
      };

      const nextWaypoints = [...trip.waypoints, newWp];
      setTrip((prev) => ({
        ...prev,
        waypoints: nextWaypoints
      }));
      showToast(`Added ${isCharging ? 'pinned charger' : 'via stop'}: "${place.name}"`);
      onClose();
      replanRoute({ waypoints: nextWaypoints });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        targetMode === 'origin'
          ? 'Select Origin Location'
          : targetMode === 'destination'
          ? 'Select Destination Location'
          : 'Add Stop to Journey'
      }
      maxWidth="max-w-xl"
    >
      <div className="py-1">
        <UniversalLocationSearch
          autoFocus={isOpen}
          placeholder="Search cities, addresses, restaurants, hotels, attractions, chargers..."
          targetMode={targetMode}
          center={trip.origin.coordinates}
          onSelectPlace={handleSelectPlace}
          onClose={onClose}
        />
      </div>
    </Modal>
  );
};
