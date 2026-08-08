import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { View, StyleSheet } from 'react-native';

type Point = { year: number; score: number };

type Props = {
  data: Point[];
  color: string;
  width?: number;
  height?: number;
};

/** Web sparkline via recharts — no axes/grid, just the trend shape. */
export default function TrendSparkline({
  data,
  color,
  width = 200,
  height = 56,
}: Props) {
  if (!data.length) {
    return <View style={[styles.empty, { width, height }]} />;
  }

  return (
    <View style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis domain={[0, 100]} hide />
          <Line
            type="monotone"
            dataKey="score"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { backgroundColor: 'transparent' },
});
