import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

const MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
let mapsLoadPromise = null;

function loadGoogleMaps() {
  if (window.google?.maps?.places) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
  return mapsLoadPromise;
}

/** Text input with Google Places autocomplete (gyms, stadiums, addresses…), falls back to a plain input if no API key is configured. */
export default function PlaceAutocompleteInput({ value, onChange, placeholder, testId, className }) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    if (!MAPS_API_KEY) return;
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !inputRef.current || autocompleteRef.current) return;
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ["formatted_address", "name", "geometry"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const label = place.name && place.formatted_address
          ? `${place.name}, ${place.formatted_address}`
          : (place.formatted_address || place.name || inputRef.current.value);
        onChange(label);
      });
      autocompleteRef.current = ac;
    }).catch(() => { /* Maps failed to load — plain input still works */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Input
      ref={inputRef}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className={className}
      autoComplete="off"
    />
  );
}
