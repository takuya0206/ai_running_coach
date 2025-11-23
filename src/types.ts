export interface Activity {
    'Activity Type': string;
    'Date': string;
    'Favorite': string;
    'Title': string;
    'Distance': string;
    'Calories': string;
    'Time': string;
    'Avg HR': string;
    'Max HR': string;
    'Avg Run Cadence': string;
    'Max Run Cadence': string;
    'Avg Pace': string;
    'Best Pace': string;
    'Total Ascent': string;
    'Total Descent': string;
    'Avg Stride Length': string;
    'Avg Vertical Ratio': string;
    'Avg Vertical Oscillation': string;
    'Training Stress Score®': string;
    'Grit': string;
    'Flow': string;
    'Dive Time': string;
    'Min Temp': string;
    'Surface Interval': string;
    'Decompression': string;
    'Best Lap Time': string;
    'Number of Laps': string;
    'Max Temp': string;
    'Moving Time': string;
    'Elapsed Time': string;
    'Min Elevation': string;
    'Max Elevation': string;
    // Garmin CSVs have dynamic columns, but these are common.
    // We'll use a loose type for now or just Record<string, string> if we want to be safe.
    // But having some known fields helps.
    [key: string]: string;
}
