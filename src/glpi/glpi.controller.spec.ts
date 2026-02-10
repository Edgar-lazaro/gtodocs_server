import { Test, TestingModule } from '@nestjs/testing';
import { GlpiController } from './glpi.controller';
import { GlpiService } from './glpi.service';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('GlpiController', () => {
  let controller: GlpiController;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [GlpiController],
      providers: [
        {
          provide: GlpiService,
          useValue: {
            crearTicket: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn(() => true) });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<GlpiController>(GlpiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
