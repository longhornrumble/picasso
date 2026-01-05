// ShowcaseCard.test.jsx - Test suite for ShowcaseCard component
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShowcaseCard from '../ShowcaseCard';

// Mock CTAButton component
jest.mock('../CTAButton', () => {
  return function CTAButton({ cta, onClick, disabled }) {
    return (
      <button
        data-testid={`cta-${cta.id}`}
        data-position={cta._position}
        onClick={() => onClick(cta)}
        disabled={disabled}
      >
        {cta.label}
      </button>
    );
  };
});

describe('ShowcaseCard', () => {
  const mockOnCTAClick = jest.fn();

  const minimalShowcaseCard = {
    id: 'test_showcase',
    type: 'program',
    name: 'Test Program',
    tagline: 'Test tagline',
    description: 'Test description'
  };

  const fullShowcaseCard = {
    id: 'holiday_2025',
    type: 'campaign',
    name: 'Holiday Giving Guide 2025',
    tagline: 'Make a child\'s holiday magical',
    description: 'This season, there are many ways to support foster children.',
    image_url: 'https://example.com/holiday.jpg',
    stats: '500+ children served',
    testimonial: 'Best experience ever! - Sarah M.',
    highlights: [
      'Multiple ways to give',
      'Direct impact',
      'Year-round support',
      'Community engagement'
    ],
    ctaButtons: {
      primary: {
        id: 'toy_drive',
        label: 'Join Toy Drive',
        action: 'external_link',
        url: 'https://example.com/toy-drive'
      },
      secondary: [
        {
          id: 'wish_list',
          label: 'Browse Wish Lists',
          action: 'external_link',
          url: 'https://example.com/wish-lists'
        },
        {
          id: 'santa_party',
          label: 'RSVP Santa Party',
          action: 'start_form',
          formId: 'santa_party_rsvp'
        }
      ]
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render nothing if showcaseCard is null', () => {
      const { container } = render(
        <ShowcaseCard showcaseCard={null} onCTAClick={mockOnCTAClick} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should render minimal showcase card with required fields only', () => {
      render(<ShowcaseCard showcaseCard={minimalShowcaseCard} onCTAClick={mockOnCTAClick} />);

      expect(screen.getByRole('article')).toBeInTheDocument();
      expect(screen.getByText('Test Program')).toBeInTheDocument();
      expect(screen.getByText('Test tagline')).toBeInTheDocument();
      expect(screen.getByText('Test description')).toBeInTheDocument();
      expect(screen.getByText('program')).toBeInTheDocument();
    });

    it('should render all optional fields when provided', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      expect(screen.getByText('Holiday Giving Guide 2025')).toBeInTheDocument();
      expect(screen.getByText('Make a child\'s holiday magical')).toBeInTheDocument();
      expect(screen.getByText('This season, there are many ways to support foster children.')).toBeInTheDocument();
      expect(screen.getByText('500+ children served')).toBeInTheDocument();
      expect(screen.getByText('Best experience ever! - Sarah M.')).toBeInTheDocument();
    });

    it('should render image with correct attributes', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const image = screen.getByAltText('Holiday Giving Guide 2025');
      expect(image).toHaveClass('showcase-card-image');
      expect(image).toHaveAttribute('src', 'https://example.com/holiday.jpg');
      expect(image).toHaveAttribute('loading', 'lazy');
    });

    it('should not render image if image_url is missing', () => {
      render(<ShowcaseCard showcaseCard={minimalShowcaseCard} onCTAClick={mockOnCTAClick} />);

      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
  });

  describe('Highlights Rendering', () => {
    it('should render highlights in a list', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const highlightsList = screen.getByLabelText('Key highlights');
      expect(highlightsList).toHaveClass('showcase-card-highlights');

      fullShowcaseCard.highlights.forEach((highlight) => {
        expect(screen.getByText(highlight)).toBeInTheDocument();
      });
    });

    it('should not render highlights section if highlights array is empty', () => {
      const cardWithoutHighlights = {
        ...minimalShowcaseCard,
        highlights: []
      };

      render(<ShowcaseCard showcaseCard={cardWithoutHighlights} onCTAClick={mockOnCTAClick} />);

      expect(screen.queryByLabelText('Key highlights')).not.toBeInTheDocument();
    });

    it('should apply correct CSS class to each highlight item', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const highlightItems = screen.getAllByRole('listitem');
      highlightItems.forEach((item) => {
        expect(item).toHaveClass('showcase-card-highlight');
      });
    });
  });

  describe('CTA Buttons', () => {
    it('should render primary CTA with correct position metadata', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const primaryButton = screen.getByTestId('cta-toy_drive');
      expect(primaryButton).toHaveAttribute('data-position', 'primary');
      expect(primaryButton).toHaveTextContent('Join Toy Drive');
    });

    it('should render secondary CTAs with correct position metadata', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const wishListButton = screen.getByTestId('cta-wish_list');
      const santaButton = screen.getByTestId('cta-santa_party');

      expect(wishListButton).toHaveAttribute('data-position', 'secondary');
      expect(santaButton).toHaveAttribute('data-position', 'secondary');
    });

    it('should call onCTAClick when primary CTA is clicked', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const primaryButton = screen.getByTestId('cta-toy_drive');
      fireEvent.click(primaryButton);

      expect(mockOnCTAClick).toHaveBeenCalledTimes(1);
      expect(mockOnCTAClick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'toy_drive',
          label: 'Join Toy Drive',
          action: 'external_link',
          _position: 'primary'
        })
      );
    });

    it('should call onCTAClick when secondary CTA is clicked', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const wishListButton = screen.getByTestId('cta-wish_list');
      fireEvent.click(wishListButton);

      expect(mockOnCTAClick).toHaveBeenCalledTimes(1);
      expect(mockOnCTAClick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'wish_list',
          label: 'Browse Wish Lists',
          action: 'external_link',
          _position: 'secondary'
        })
      );
    });

    it('should not render CTA section if no CTAs provided', () => {
      render(<ShowcaseCard showcaseCard={minimalShowcaseCard} onCTAClick={mockOnCTAClick} />);

      expect(screen.queryByRole('group', { name: 'Available actions' })).not.toBeInTheDocument();
    });

    it('should render only primary CTA if no secondary CTAs', () => {
      const cardWithPrimaryOnly = {
        ...minimalShowcaseCard,
        ctaButtons: {
          primary: {
            id: 'primary_only',
            label: 'Primary Action',
            action: 'external_link',
            url: 'https://example.com'
          }
        }
      };

      render(<ShowcaseCard showcaseCard={cardWithPrimaryOnly} onCTAClick={mockOnCTAClick} />);

      expect(screen.getByTestId('cta-primary_only')).toBeInTheDocument();
      expect(screen.queryByTestId('cta-wish_list')).not.toBeInTheDocument();
    });

    it('should render only secondary CTAs if no primary CTA', () => {
      const cardWithSecondaryOnly = {
        ...minimalShowcaseCard,
        ctaButtons: {
          secondary: [
            {
              id: 'secondary_1',
              label: 'Secondary 1',
              action: 'external_link',
              url: 'https://example.com/1'
            },
            {
              id: 'secondary_2',
              label: 'Secondary 2',
              action: 'external_link',
              url: 'https://example.com/2'
            }
          ]
        }
      };

      render(<ShowcaseCard showcaseCard={cardWithSecondaryOnly} onCTAClick={mockOnCTAClick} />);

      expect(screen.getByTestId('cta-secondary_1')).toBeInTheDocument();
      expect(screen.getByTestId('cta-secondary_2')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should use semantic HTML with article element', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('should have proper ARIA labels', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      expect(screen.getByLabelText('Type: campaign')).toBeInTheDocument();
      expect(screen.getByLabelText('Statistics')).toBeInTheDocument();
      expect(screen.getByLabelText('Key highlights')).toBeInTheDocument();
      expect(screen.getByLabelText('Available actions')).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toHaveTextContent('Holiday Giving Guide 2025');
      expect(heading).toHaveAttribute('id', 'showcase-holiday_2025-title');
    });

    it('should have aria-labelledby linking article to title', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const article = screen.getByRole('article');
      expect(article).toHaveAttribute('aria-labelledby', 'showcase-holiday_2025-title');
    });

    it('should render testimonial as blockquote', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const blockquote = screen.getByRole('blockquote');
      expect(blockquote).toHaveTextContent('Best experience ever! - Sarah M.');
    });

    it('should support keyboard navigation for CTAs', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const primaryButton = screen.getByTestId('cta-toy_drive');
      primaryButton.focus();

      expect(document.activeElement).toBe(primaryButton);
    });
  });

  describe('Data Attributes', () => {
    it('should include data attributes for showcase ID and type', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const article = screen.getByRole('article');
      expect(article).toHaveAttribute('data-showcase-id', 'holiday_2025');
      expect(article).toHaveAttribute('data-showcase-type', 'campaign');
    });
  });

  describe('CSS Classes', () => {
    it('should apply all required CSS classes', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      expect(screen.getByRole('article')).toHaveClass('showcase-card');
      expect(screen.getByRole('img')).toHaveClass('showcase-card-image');
      expect(screen.getByText('campaign')).toHaveClass('showcase-card-type');
      expect(screen.getByRole('heading')).toHaveClass('showcase-card-title');
      expect(screen.getByText('Make a child\'s holiday magical')).toHaveClass('showcase-card-tagline');
    });

    it('should accept and apply custom className', () => {
      render(
        <ShowcaseCard
          showcaseCard={minimalShowcaseCard}
          onCTAClick={mockOnCTAClick}
          className="custom-class"
        />
      );

      const article = screen.getByRole('article');
      expect(article).toHaveClass('showcase-card');
      expect(article).toHaveClass('custom-class');
    });

    it('should handle empty className prop gracefully', () => {
      render(
        <ShowcaseCard
          showcaseCard={minimalShowcaseCard}
          onCTAClick={mockOnCTAClick}
          className=""
        />
      );

      const article = screen.getByRole('article');
      expect(article).toHaveClass('showcase-card');
      expect(article.className).toBe('showcase-card');
    });
  });

  describe('Error Handling', () => {
    it('should handle image load errors gracefully', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const image = screen.getByAltText('Holiday Giving Guide 2025');
      fireEvent.error(image);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load image')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should hide image on error', () => {
      render(<ShowcaseCard showcaseCard={fullShowcaseCard} onCTAClick={mockOnCTAClick} />);

      const image = screen.getByAltText('Holiday Giving Guide 2025');
      fireEvent.error(image);

      expect(image.style.display).toBe('none');
    });
  });

  describe('Different Showcase Types', () => {
    const types = ['program', 'event', 'initiative', 'campaign'];

    types.forEach((type) => {
      it(`should render correctly with type: ${type}`, () => {
        const card = {
          ...minimalShowcaseCard,
          type,
          id: `test_${type}`
        };

        render(<ShowcaseCard showcaseCard={card} onCTAClick={mockOnCTAClick} />);

        expect(screen.getByText(type)).toBeInTheDocument();
        expect(screen.getByRole('article')).toHaveAttribute('data-showcase-type', type);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty highlights array', () => {
      const card = {
        ...fullShowcaseCard,
        highlights: []
      };

      render(<ShowcaseCard showcaseCard={card} onCTAClick={mockOnCTAClick} />);

      expect(screen.queryByLabelText('Key highlights')).not.toBeInTheDocument();
    });

    it('should handle single highlight', () => {
      const card = {
        ...fullShowcaseCard,
        highlights: ['Single highlight']
      };

      render(<ShowcaseCard showcaseCard={card} onCTAClick={mockOnCTAClick} />);

      const highlightsList = screen.getByLabelText('Key highlights');
      expect(highlightsList).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });

    it('should handle empty secondary CTAs array', () => {
      const card = {
        ...fullShowcaseCard,
        ctaButtons: {
          primary: fullShowcaseCard.ctaButtons.primary,
          secondary: []
        }
      };

      render(<ShowcaseCard showcaseCard={card} onCTAClick={mockOnCTAClick} />);

      expect(screen.getByTestId('cta-toy_drive')).toBeInTheDocument();
      expect(screen.queryByTestId('cta-wish_list')).not.toBeInTheDocument();
    });

    it('should handle very long text fields gracefully', () => {
      const longTextCard = {
        ...minimalShowcaseCard,
        name: 'A'.repeat(200),
        description: 'B'.repeat(1000),
        tagline: 'C'.repeat(300)
      };

      render(<ShowcaseCard showcaseCard={longTextCard} onCTAClick={mockOnCTAClick} />);

      expect(screen.getByRole('article')).toBeInTheDocument();
      expect(screen.getByRole('heading')).toHaveTextContent('A'.repeat(200));
    });
  });
});
