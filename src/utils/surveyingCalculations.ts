// Core surveying calculation functions

export class SurveyingCalculations {
  
  // Convert degrees-minutes-seconds to decimal degrees
  static dmsToDecimal(degrees: number, minutes: number, seconds: number): number {
    return Math.abs(degrees) + minutes / 60 + seconds / 3600;
  }

  // Convert decimal degrees to degrees-minutes-seconds
  static decimalToDms(decimal: number): { degrees: number; minutes: number; seconds: number } {
    const degrees = Math.floor(Math.abs(decimal));
    const minutesFloat = (Math.abs(decimal) - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = Math.round((minutesFloat - minutes) * 60 * 1000) / 1000;
    
    return {
      degrees,
      minutes,
      seconds
    };
  }

  // Format DMS for display
  static formatDMS(degrees: number, minutes: number, seconds: number): string {
    return `${degrees}° ${minutes.toString().padStart(2, '0')}' ${seconds.toFixed(3).padStart(6, '0')}"`;
  }

  // Parse DMS string to components
  static parseDMS(dmsString: string): { degrees: number; minutes: number; seconds: number } | null {
    const regex = /^(\d+)[°\s]+(\d+)['\s]+([0-9.]+)["]*$/;
    const match = dmsString.trim().match(regex);
    
    if (!match) return null;
    
    return {
      degrees: parseInt(match[1]),
      minutes: parseInt(match[2]),
      seconds: parseFloat(match[3])
    };
  }

  // Calculate bearing between two points (Zimbabwe convention: 0° = South)
  static calculateBearing(fromY: number, fromX: number, toY: number, toX: number): number {
    if (fromY === toY && fromX === toX) {
      throw new Error('Cannot calculate bearing between identical points');
    }
    
    const deltaY = toY - fromY; // West is positive
    const deltaX = toX - fromX; // South is positive
    
    // Calculate angle from South (Zimbabwe convention)
    // atan2(deltaY, deltaX) gives angle from positive X-axis (South)
    let bearing = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    
    // Convert to positive bearing (0-360)
    if (bearing < 0) bearing += 360;
    
    return Math.round(bearing * 10000) / 10000; // Round to 4 decimal places
  }

  // Calculate distance between two points
  static calculateDistance(fromY: number, fromX: number, toY: number, toX: number): number {
    if (fromY === toY && fromX === toX) {
      return 0;
    }
    
    const deltaY = toY - fromY;
    const deltaX = toX - fromX;
    
    return Math.sqrt(deltaY * deltaY + deltaX * deltaX);
  }

  // Calculate coordinates from bearing and distance
  static calculateCoordinates(fromY: number, fromX: number, bearing: number, distance: number): { y: number; x: number } {
    const bearingRad = bearing * (Math.PI / 180);
    
    // In Zimbabwe system: bearing 0° = South, 90° = West
    const y = fromY + distance * Math.sin(bearingRad); // Y increases westwards
    const x = fromX + distance * Math.cos(bearingRad); // X increases southwards
    
    return {
      y: Math.round(y * 1000) / 1000, // Round to 3 decimal places
      x: Math.round(x * 1000) / 1000
    };
  }

  // Calculate area using coordinate method (Shoelace formula)
  static calculateArea(coordinates: Array<{ y: number; x: number }>): number {
    if (coordinates.length < 3) return 0;
    
    // Check for duplicate consecutive points
    const cleanCoords = coordinates.filter((coord, index) => {
      if (index === 0) return true;
      const prev = coordinates[index - 1];
      return !(coord.y === prev.y && coord.x === prev.x);
    });
    
    if (cleanCoords.length < 3) return 0;
    
    let area = 0;
    const n = cleanCoords.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += cleanCoords[i].y * cleanCoords[j].x;
      area -= cleanCoords[j].y * cleanCoords[i].x;
    }
    
    return Math.abs(area) / 2;
  }

  // Convert between coordinate systems (basic transformation)
  static transformCoordinates(
    y: number, 
    x: number, 
    fromSystem: string, 
    toSystem: string
  ): { y: number; x: number } {
    // This is a simplified example - in reality, you'd need proper coordinate transformation libraries
    // For now, return the same coordinates
    console.log(`Transforming from ${fromSystem} to ${toSystem}`);
    return { y, x };
  }

  // Convert bearing from/to different conventions
  static convertBearingToNorthOriented(southOrientedBearing: number): number {
    // Convert from South-oriented (Zimbabwe) to North-oriented (international)
    let northBearing = southOrientedBearing + 180;
    if (northBearing >= 360) northBearing -= 360;
    return northBearing;
  }

  static convertBearingToSouthOriented(northOrientedBearing: number): number {
    // Convert from North-oriented (international) to South-oriented (Zimbabwe)
    let southBearing = northOrientedBearing - 180;
    if (southBearing < 0) southBearing += 360;
    return southBearing;
  }

  // Format beacon name in Zimbabwe convention P(Y,X)
  static formatBeaconName(beaconName: string, y: number, x: number): string {
    return `${beaconName}(${y.toFixed(3)},${x.toFixed(3)})`;
  }

  // Zimbabwe surveying rounding convention
  // 123.5 rounds to 123 (round half to even)
  // 124.5 rounds to 124 (round half to even)  
  // 124.51 rounds to 125 (normal rounding)
  static surveyingRound(value: number, decimalPlaces: number = 0): number {
    const factor = Math.pow(10, decimalPlaces);
    const scaled = value * factor;
    const fractional = scaled - Math.floor(scaled);
    
    if (fractional === 0.5) {
      // Round half to even (banker's rounding)
      const integer = Math.floor(scaled);
      return (integer % 2 === 0 ? integer : integer + 1) / factor;
    } else {
      // Normal rounding for non-half values
      return Math.round(scaled) / factor;
    }
  }

  // Format area according to Zimbabwe cadastral surveying conventions
  static formatArea(areaInSquareMeters: number): {
    primaryValue: string;
    primaryUnit: string;
    secondaryValue?: string;
    secondaryUnit?: string;
    displayText: string;
  } {
    if (areaInSquareMeters < 10000) {
      // Less than 1 hectare - show in square meters to nearest whole number
      const roundedArea = this.surveyingRound(areaInSquareMeters, 0);
      return {
        primaryValue: roundedArea.toString(),
        primaryUnit: 'm²',
        displayText: `${roundedArea} m²`
      };
    } else {
      // 1 hectare or more - show in hectares to 4 decimal places
      const hectares = areaInSquareMeters / 10000;
      const roundedHectares = this.surveyingRound(hectares, 4);
      const squareMeters = this.surveyingRound(areaInSquareMeters, 0);
      
      return {
        primaryValue: roundedHectares.toFixed(4),
        primaryUnit: 'ha',
        secondaryValue: squareMeters.toString(),
        secondaryUnit: 'm²',
        displayText: `${roundedHectares.toFixed(4)} ha (${squareMeters} m²)`
      };
    }
  }

  // Traverse adjustment using compass rule
  static adjustTraverse(stations: Array<{ y: number; x: number; name: string }>): {
    adjustedStations: Array<{ y: number; x: number; name: string; adjustment: { y: number; x: number } }>;
    closureError: { y: number; x: number; distance: number };
    precision: number;
  } {
    if (stations.length < 3) {
      throw new Error("Need at least 3 stations for traverse adjustment");
    }

    // Calculate closure error
    const firstStation = stations[0];
    const lastStation = stations[stations.length - 1];
    const closureError = {
      y: firstStation.y - lastStation.y,
      x: firstStation.x - lastStation.x,
      distance: 0
    };
    closureError.distance = Math.sqrt(closureError.y ** 2 + closureError.x ** 2);

    // Calculate perimeter for precision
    let perimeter = 0;
    for (let i = 0; i < stations.length - 1; i++) {
      const dist = this.calculateDistance(
        stations[i].y, stations[i].x,
        stations[i + 1].y, stations[i + 1].x
      );
      perimeter += dist;
    }

    const precision = perimeter / closureError.distance;

    // Apply compass rule adjustment
    const adjustedStations = stations.map((station, index) => {
      if (index === 0) {
        return {
          ...station,
          adjustment: { y: 0, x: 0 }
        };
      }

      // Calculate distance from start to this station
      let distanceFromStart = 0;
      for (let i = 0; i < index; i++) {
        distanceFromStart += this.calculateDistance(
          stations[i].y, stations[i].x,
          stations[i + 1].y, stations[i + 1].x
        );
      }

      const ratio = distanceFromStart / perimeter;
      const adjustment = {
        y: -closureError.y * ratio,
        x: -closureError.x * ratio
      };

      return {
        ...station,
        y: station.y + adjustment.y,
        x: station.x + adjustment.x,
        adjustment
      };
    });

    return {
      adjustedStations,
      closureError,
      precision
    };
  }
}