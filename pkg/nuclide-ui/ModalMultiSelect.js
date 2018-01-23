/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 * @format
 */

import type {ButtonSize} from 'nuclide-commons-ui/Button';
import type {OptionComponentProps} from './MultiSelectList';

import {Button, ButtonSizes, ButtonTypes} from 'nuclide-commons-ui/Button';
import {ButtonGroup} from 'nuclide-commons-ui/ButtonGroup';
import {Modal} from './Modal';
import {MultiSelectList} from './MultiSelectList';
import classnames from 'classnames';
import * as React from 'react';

type Option = {
  // $FlowFixMe(>=0.53.0) Flow suppress
  label: React.Children,
  value: any,
};

type Props = {
  labelComponent?: (props: LabelComponentProps) => React.Element<any>,
  optionComponent?: (props: OptionComponentProps) => React.Element<any>,
  className?: string,
  disabled?: boolean,
  options: Array<Option>,
  value: Array<any>,
  onChange: (value: Array<any>) => void,
  size?: ButtonSize, // TODO: We really need to be consistent about these. SMALL or sm?? id:538 gh:539
};

type State = {
  activeValues: Array<any>,
  showModal: boolean,
};

/**
 * A `<select>`-like control that uses an Atom modal for its options. This component uses an API as
 * similar to `Dropdown` as possible, with extra props for customizing display options.
 */
export class ModalMultiSelect extends React.Component<Props, State> {
  static defaultProps = {
    className: '',
    disabled: false,
    labelComponent: DefaultLabelComponent,
    onChange: (value: Array<any>) => {},
    options: [],
    value: [],
    size: ButtonSizes.SMALL,
  };

  constructor(props: Props) {
    super(props);
    this.state = {
      activeValues: props.value,
      showModal: false,
    };
  }

  render(): React.Node {
    const LabelComponent = this.props.labelComponent || DefaultLabelComponent;
    const selectedOptions = this.props.options.filter(
      option => this.props.value.indexOf(option.value) !== -1,
    );
    const className = classnames(this.props.className, {
      'btn-warning': this.props.value.length === 0,
    });
    return (
      <Button
        className={className}
        disabled={this.props.disabled}
        size={this.props.size}
        onClick={this._showModal}>
        <LabelComponent selectedOptions={selectedOptions} />
        {this._renderModal()}
      </Button>
    );
  }

  _selectAll = (): void => {
    const allValues = this.props.options.map(option => option.value);
    this.setState({activeValues: allValues});
  };

  _selectNone = (): void => {
    this.setState({activeValues: []});
  };

  _resetSelection = (): void => {
    this.setState({activeValues: this.props.value});
  };

  _showModal = (): void => {
    this.setState({
      showModal: true,
      // When you show the modal, the initial selection should match the actually selected values.
      activeValues: this.props.value,
    });
  };

  _dismissModal = (): void => {
    this.setState({showModal: false});
  };

  _confirmValues = (): void => {
    // TODO (matthewwithanm): Use ctrl-enter to confirm id:552 gh:553
    this._dismissModal();
    this.props.onChange(this.state.activeValues);
  };

  _renderModal(): ?React.Element<any> {
    if (!this.state.showModal) {
      return;
    }

    return (
      <Modal onDismiss={this._dismissModal}>
        {/* $FlowFixMe(>=0.53.0) Flow suppress */}
        <MultiSelectList
          commandScope={atom.views.getView(atom.workspace)}
          value={this.state.activeValues}
          options={this.props.options}
          optionComponent={this.props.optionComponent}
          onChange={activeValues => this.setState({activeValues})}
        />
        <div className="nuclide-modal-multi-select-actions">
          <ButtonGroup>
            <Button onClick={this._selectNone}>None</Button>
            <Button onClick={this._selectAll}>All</Button>
            <Button onClick={this._resetSelection}>Reset</Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button onClick={this._dismissModal}>Cancel</Button>
            <Button
              buttonType={ButtonTypes.PRIMARY}
              onClick={this._confirmValues}>
              Confirm
            </Button>
          </ButtonGroup>
        </div>
      </Modal>
    );
  }
}

type LabelComponentProps = {
  selectedOptions: Array<any>,
};

function DefaultLabelComponent(props: LabelComponentProps) {
  const count = props.selectedOptions.length;
  const noun = count === 1 ? 'Item' : 'Items';
  return <span>{`${count} ${noun} Selected`}</span>;
}
