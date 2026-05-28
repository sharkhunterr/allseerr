import type { DiscoverSliderType } from '@server/constants/discover';
import { defaultSliders } from '@server/constants/discover';
import { getRepository } from '@server/datasource';
import logger from '@server/logger';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
class DiscoverSlider {
  public static async bootstrapSliders(): Promise<void> {
    const sliderRepository = getRepository(DiscoverSlider);

    for (const slider of defaultSliders) {
      const existingSlider = await sliderRepository.findOne({
        where: {
          type: slider.type,
        },
      });

      if (!existingSlider) {
        logger.info('Creating built-in discovery slider', {
          label: 'Discover Slider',
          slider,
        });
        await sliderRepository.save(new DiscoverSlider(slider));
      } else if (
        existingSlider.isBuiltIn &&
        slider.order !== undefined &&
        existingSlider.order !== slider.order
      ) {
        // Re-pin built-in sliders to the canonical default order
        // whenever ``defaultSliders`` changes. Without this,
        // operators who bootstrapped on an earlier layout would
        // keep stale positions for built-ins (e.g. a new genre
        // row landing at the bottom of the dashboard instead of
        // right after its sibling Popular row). Custom slider
        // entries are untouched — only ``isBuiltIn`` rows get
        // re-pinned, so an operator's hand-arranged custom
        // sliders stay where they put them.
        existingSlider.order = slider.order;
        await sliderRepository.save(existingSlider);
      }
    }
  }

  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'int' })
  public type: DiscoverSliderType;

  @Column({ type: 'int' })
  public order: number;

  @Column({ default: false })
  public isBuiltIn: boolean;

  @Column({ default: true })
  public enabled: boolean;

  @Column({ nullable: true })
  // Title is not required for built in sliders because we will
  // use translations for them.
  public title?: string;

  @Column({ nullable: true })
  public data?: string;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({ type: resolveDbType('datetime') })
  public updatedAt: Date;

  constructor(init?: Partial<DiscoverSlider>) {
    Object.assign(this, init);
  }
}

export default DiscoverSlider;
