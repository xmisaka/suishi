/**
 * 岁时 · 关于
 *
 * 一页书卷气的说明。刻意写得像序，不像「产品介绍」——
 * 这个应用本身就是在讲时间，说明文字也该有相应的语气。
 */

import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Card, Gutter, Screen, ScreenScroll } from '@/components/ui/layout';
import { IconButton } from '@/components/ui/controls';
import { Body, Display, Label, Meta } from '@/components/ui/typography';
import { APP_VERSION } from '@/constants/app';
import { Space, Type } from '@/constants/theme';
import { makeStyles } from '@/lib/theme';

export default function AboutScreen() {
  const styles = useStyles();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" accessibilityLabel="返回" onPress={() => router.back()} />
      </View>

      <ScreenScroll bottomInset={Space.xxxl}>
        <Gutter>
          <View style={styles.hero}>
            <Display style={styles.name}>岁时</Display>
            <Label tone="ink3" style={styles.tagline}>
              记录重要的日子
            </Label>
          </View>

          <Body tone="ink2" style={styles.para}>
            岁时用一张圆盘装下一年。每一个日子是一枚光点，按它离今天有多远落在环上；
            拖动圆盘，指针底下的那个就是焦点。
          </Body>

          <Body tone="ink2" style={styles.para}>
            农历与公历在这里是平等的两套语言。你既可以记「八月十五」，也可以记「九月二十三」——
            记农历就把农历的月日原样存下来，每年该落在哪天，现算。
          </Body>

          <Card style={styles.note}>
            <Label tone="ink3" style={styles.noteLabel}>
              一处取舍
            </Label>
            <Body tone="ink2" style={styles.noteText}>
              农历的日子不会被换算成公历存起来。因为「八月十五」对应的公历日期每隔几年就会变，
              一旦只存公历，等于把这个事实降级成某一年的快照，明年就错了。
            </Body>
          </Card>

          <Card style={styles.note}>
            <Label tone="ink3" style={styles.noteLabel}>
              数据
            </Label>
            <Body tone="ink2" style={styles.noteText}>
              全部存在这台设备上。不上传、不需要账号、没有网络请求。
              删除的条目会先进回收站，可以随时找回；想搬去另一台设备，
              在「我的」页里可以把全部日子导出成一个文件。
            </Body>
          </Card>

          <Meta tone="ink4" style={styles.version}>
            岁时 v{APP_VERSION} · Expo SDK 57
          </Meta>
        </Gutter>
      </ScreenScroll>
    </Screen>
  );
}

const useStyles = makeStyles((Palette) => ({
  topBar: { flexDirection: 'row', paddingHorizontal: Space.md, paddingVertical: Space.sm },
  hero: { alignItems: 'center', paddingVertical: Space.xxxl, gap: Space.sm },
  name: { ...(Type.display as object), fontSize: 34, letterSpacing: 8 },
  tagline: { letterSpacing: 3, fontSize: 12 },
  para: { lineHeight: 25, marginBottom: Space.lg },
  note: { marginBottom: Space.md, gap: Space.sm },
  noteLabel: { fontSize: 11, letterSpacing: 2 },
  noteText: { lineHeight: 23 },
  version: { textAlign: 'center', marginTop: Space.xxl, fontSize: 11.5, color: Palette.ink4 },
}));
